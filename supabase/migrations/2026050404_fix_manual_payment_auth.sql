-- ================================================================
-- FIX: create_manual_payment auth check failure
-- The check_worker_role() call was blocking all manual transactions
-- because the parameter name 'allowed_roles' didn't match 'p_role_list'.
-- This fix replaces it with a direct, reliable workers table lookup.
-- ================================================================

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
  v_effective_loan_id := CASE WHEN v_is_reg_fee THEN 'REG-FEE-' || p_customer_id ELSE p_loan_id END;

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
