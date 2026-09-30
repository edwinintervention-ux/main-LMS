-- ================================================================
-- MIGRATION: Fix Registration Fee Foreign Key Violation
-- Problem: The RPCs were trying to set loan_id to 'REG-FEE-...' 
-- which violates the foreign key constraint to the loans table.
-- Fix: Use NULL for loan_id when it is a registration fee.
-- ================================================================

-- 1. Fix create_manual_payment
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
  v_payment_id TEXT;
  v_is_reg_fee BOOLEAN;
  v_status TEXT := 'Allocated';
  v_note TEXT;
  v_effective_loan_id TEXT;
  v_new_pay_id TEXT;
BEGIN
  -- 1. Get caller identity from JWT
  v_admin_email := auth.jwt() ->> 'email';

  -- 2. Security Check: Look up role directly from workers table
  SELECT role INTO v_admin_role
  FROM public.workers
  WHERE LOWER(email) = LOWER(v_admin_email);

  IF v_admin_role IS NULL OR v_admin_role NOT IN ('Admin', 'Finance', 'Super Admin', 'Director') THEN
    RAISE EXCEPTION 'Unauthorized: Only administrative staff can log manual payments. Caller: %', COALESCE(v_admin_email, 'anonymous');
  END IF;

  -- 3. Fetch canonical customer name
  SELECT name INTO v_customer_name FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  v_is_reg_fee := (p_payment_type = 'registration_fee');
  
  -- FIX: Do not use 'REG-FEE-...' prefix as it violates foreign key to loans table
  v_effective_loan_id := CASE WHEN v_is_reg_fee THEN NULL ELSE p_loan_id END;

  v_note := CASE
    WHEN v_is_reg_fee THEN 'Registration Fee — ' || p_method || ' (Manual Entry by ' || v_admin_email || ')'
    ELSE 'Manual Entry (' || p_method || ') by ' || v_admin_email
  END;

  -- 4. Generate payment ID
  v_new_pay_id := 'PAY-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8));

  -- 5. Insert into payments table
  INSERT INTO public.payments (
    id,
    customer_id,
    customer_name,
    loan_id,
    amount,
    mpesa,
    date,
    status,
    allocated_by,
    allocated_at,
    note,
    is_reg_fee
  ) VALUES (
    v_new_pay_id,
    p_customer_id,
    v_customer_name,
    v_effective_loan_id,
    p_amount,
    p_reference,
    NOW(),
    v_status,
    v_admin_email,
    NOW(),
    v_note,
    v_is_reg_fee
  );

  -- 6. If Registration Fee: Update Customer Status
  IF v_is_reg_fee THEN
    UPDATE public.customers
    SET mpesa_registered = true
    WHERE id = p_customer_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_new_pay_id,
    'customer_name', v_customer_name,
    'is_reg_fee', v_is_reg_fee
  );
END;
$$;

-- 2. Fix apply_c2b_payment
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
  v_new_balance    NUMERIC;
  v_new_status     TEXT;
  v_current_balance NUMERIC;
  v_current_status  TEXT;
  v_payment_status  TEXT;
  v_allocated_by    TEXT;
  v_allocated_at    TIMESTAMPTZ;
  v_is_reg_fee      BOOLEAN := false;
BEGIN
  -- 1. Idempotency guard
  IF EXISTS (SELECT 1 FROM payments WHERE mpesa = p_mpesa_txid LIMIT 1) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate_txid');
  END IF;

  -- 2. If a loan is targeted, lock the row and read current balance
  IF p_loan_id IS NOT NULL AND NOT (p_loan_id LIKE 'REG-FEE-%') THEN
    SELECT balance, status
      INTO v_current_balance, v_current_status
      FROM loans
     WHERE id = p_loan_id
       FOR UPDATE;

    IF NOT FOUND THEN
      -- If loan ID was provided but not found, we'll treat it as unallocated rather than crashing
      p_loan_id := NULL;
    ELSE
      v_new_balance := GREATEST(0, v_current_balance - p_amount);
      v_new_status  := CASE WHEN v_new_balance <= 0 THEN 'Settled' ELSE v_current_status END;
      v_payment_status := 'Allocated';
      v_allocated_by   := 'System Engine';
      v_allocated_at   := NOW();
    END IF;
  END IF;

  -- 3. If no loan found or it's a registration fee
  IF p_loan_id IS NULL OR p_loan_id LIKE 'REG-FEE-%' THEN
    IF p_amount = 500 OR p_note ILIKE '%Reg%' OR p_loan_id LIKE 'REG-FEE-%' THEN
      p_loan_id        := NULL; -- FIX: NULL instead of 'REG-FEE-...'
      v_payment_status := 'Allocated';
      v_allocated_by   := 'System Engine (Reg Fee)';
      v_allocated_at   := NOW();
      v_is_reg_fee     := true;
    ELSE
      v_payment_status := 'Unallocated';
      v_allocated_by   := NULL;
      v_allocated_at   := NULL;
    END IF;
  END IF;

  -- 4. Insert payment record
  INSERT INTO payments (
    customer_id,
    customer_name,
    loan_id,
    amount,
    mpesa,
    date,
    status,
    allocated_by,
    allocated_at,
    is_reg_fee,
    note
  )
  VALUES (
    p_customer_id,
    p_customer_name,
    p_loan_id,
    p_amount,
    p_mpesa_txid,
    p_date,
    v_payment_status,
    v_allocated_by,
    v_allocated_at,
    v_is_reg_fee,
    p_note
  )
  RETURNING id INTO v_payment_id;

  -- 5. Update loan balance (only if a real loan was targeted)
  IF p_loan_id IS NOT NULL AND v_is_reg_fee = false THEN
    UPDATE loans
       SET balance = v_new_balance,
           status  = v_new_status
     WHERE id = p_loan_id;
  END IF;
  
  -- 6. If Registration Fee: Update Customer Status
  IF v_is_reg_fee THEN
    UPDATE public.customers
    SET mpesa_registered = true
    WHERE id = p_customer_id;
  END IF;

  -- 7. Return result
  RETURN jsonb_build_object(
    'success',      true,
    'payment_id',   v_payment_id,
    'loan_id',      p_loan_id,
    'new_balance',  v_new_balance,
    'new_status',   v_new_status,
    'allocated',    (p_loan_id IS NOT NULL OR v_is_reg_fee)
  );
END;
$$;
