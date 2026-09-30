-- ================================================================
-- MIGRATION: Fix RPC Schema Mismatch & Unified Trigger Logic
-- 1. Standardize 'note' -> 'notes' in create_manual_payment and apply_c2b_payment
-- 2. Expand trg_apply_payment to handle UPDATEs (status changes)
-- ================================================================

-- 1. FIX: create_manual_payment (Standardize column name to 'notes')
CREATE OR REPLACE FUNCTION public.create_manual_payment(
  p_customer_id TEXT,
  p_amount NUMERIC,
  p_payment_type TEXT,
  p_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_loan_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_email TEXT;
  v_admin_role  TEXT;
  v_customer_name TEXT;
  v_is_reg_fee BOOLEAN;
  v_status TEXT := 'Allocated';
  v_note TEXT;
  v_effective_loan_id TEXT;
  v_new_pay_id TEXT;
BEGIN
  v_admin_email := auth.jwt() ->> 'email';

  SELECT role INTO v_admin_role
  FROM public.workers
  WHERE LOWER(email) = LOWER(v_admin_email);

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('Admin', 'Finance', 'Super Admin', 'Director') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrative staff can log manual payments.';
  END IF;

  SELECT name INTO v_customer_name FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  v_is_reg_fee := (p_payment_type = 'registration_fee');
  
  -- If not a reg fee and no loan ID provided, try to find the latest active loan
  v_effective_loan_id := p_loan_id;
  IF NOT v_is_reg_fee AND v_effective_loan_id IS NULL THEN
    SELECT id INTO v_effective_loan_id 
      FROM public.loans 
     WHERE customer_id = p_customer_id AND status IN ('Active', 'Overdue')
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  v_note := CASE
    WHEN v_is_reg_fee THEN 'Registration Fee — ' || p_method || ' (Manual Entry by ' || v_admin_email || ')'
    ELSE 'Manual Entry (' || p_method || ') by ' || v_admin_email
  END;

  v_new_pay_id := 'PAY-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8));

  INSERT INTO public.payments (
    id, customer_id, customer_name, loan_id, amount, mpesa, date, status, allocated_by, notes, is_reg_fee
  ) VALUES (
    v_new_pay_id, p_customer_id, v_customer_name, v_effective_loan_id, p_amount, p_reference, NOW(), v_status, v_admin_email, v_note, v_is_reg_fee
  );

  IF v_is_reg_fee THEN
    UPDATE public.customers SET mpesa_registered = true WHERE id = p_customer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_new_pay_id,
    'customer_name', v_customer_name,
    'is_reg_fee', v_is_reg_fee
  );
END;
$$;

-- 2. FIX: apply_c2b_payment (Standardize column name to 'notes')
CREATE OR REPLACE FUNCTION apply_c2b_payment(
  p_customer_id    TEXT,
  p_customer_name  TEXT,
  p_loan_id        TEXT,
  p_amount         NUMERIC,
  p_mpesa_txid     TEXT,
  p_date           DATE,
  p_note           TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment_id     TEXT;
  v_payment_status TEXT;
  v_allocated_by    TEXT;
  v_allocated_at    TIMESTAMPTZ;
  v_is_reg_fee      BOOLEAN := false;
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE mpesa = p_mpesa_txid LIMIT 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_txid');
  END IF;

  IF p_loan_id IS NOT NULL AND NOT (p_loan_id LIKE 'REG-FEE-%') THEN
    v_payment_status := 'Allocated';
    v_allocated_by   := 'System Engine';
    v_allocated_at   := NOW();
  ELSIF p_amount = 500 OR p_note ILIKE '%Reg%' OR (p_loan_id LIKE 'REG-FEE-%') THEN
    p_loan_id        := NULL;
    v_payment_status := 'Allocated';
    v_allocated_by   := 'System Engine (Reg Fee)';
    v_allocated_at   := NOW();
    v_is_reg_fee     := true;
  ELSE
    v_payment_status := 'Unallocated';
  END IF;

  INSERT INTO payments (
    customer_id, customer_name, loan_id, amount, mpesa, date, status, allocated_by, allocated_at, is_reg_fee, notes
  )
  VALUES (
    p_customer_id, p_customer_name, p_loan_id, p_amount, p_mpesa_txid, p_date, v_payment_status, v_allocated_by, v_allocated_at, v_is_reg_fee, p_note
  )
  RETURNING id INTO v_payment_id;

  -- NOTE: We removed manual 'UPDATE loans' from here because trg_apply_payment 
  -- will now handle both INSERT and UPDATE (status change) scenarios.

  IF v_is_reg_fee THEN
    UPDATE public.customers SET mpesa_registered = true WHERE id = p_customer_id;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'allocated', (p_loan_id IS NOT NULL OR v_is_reg_fee));
END;
$$;

-- 3. ENHANCE TRIGGER: Support UPDATEs to 'status'
-- This ensures that if a payment is manually updated to 'Allocated', the balance still syncs.
CREATE OR REPLACE FUNCTION public.apply_payment_to_loan() 
RETURNS TRIGGER AS $$
DECLARE
    p_amount     DECIMAL;
    l_penalties  DECIMAL;
    l_balance    DECIMAL;
    l_disbursed  DATE;
    calc_penalty DECIMAL;
    v_loan_id    TEXT;
BEGIN
    -- Determine if we should process
    -- Only fire if status changed to 'Allocated' OR it's a new 'Allocated' insertion
    IF (TG_OP = 'UPDATE') THEN
        IF (OLD.status = NEW.status OR NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    ELSIF (TG_OP = 'INSERT') THEN
        IF (NEW.status != 'Allocated' OR NEW.loan_id IS NULL) THEN
            RETURN NEW;
        END IF;
    END IF;

    v_loan_id := NEW.loan_id;
    p_amount  := NEW.amount;

    -- A) Get current state (Lock row)
    SELECT penalties, balance, disbursed 
      INTO l_penalties, l_balance, l_disbursed
      FROM public.loans 
     WHERE id = v_loan_id FOR UPDATE;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- B) WATERFALL: PAY OFF PENALTIES FIRST
    IF l_penalties > 0 THEN
        IF p_amount >= l_penalties THEN
            p_amount := p_amount - l_penalties;
            l_penalties := 0;
        ELSE
            l_penalties := l_penalties - p_amount;
            p_amount := 0;
        END IF;
    END IF;

    -- C) WATERFALL: PAY OFF PRINCIPAL BALANCE SECOND
    IF p_amount > 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- D) APPLY UPDATES TO LOAN
    UPDATE public.loans 
       SET balance   = l_balance,
           penalties = l_penalties,
           status    = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN 'Settled'::text ELSE status END,
           settled_at = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN NOW() ELSE settled_at END
     WHERE id = v_loan_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update trigger definition
DROP TRIGGER IF EXISTS trg_apply_payment ON public.payments;
CREATE TRIGGER trg_apply_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_to_loan();

NOTIFY pgrst, 'reload schema';
