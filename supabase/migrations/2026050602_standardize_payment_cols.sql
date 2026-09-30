-- ================================================================
-- MIGRATION: Standardize Payment Columns & Statuses
-- 1. Rename 'note' to 'notes' in payments table (standardize with codebase)
-- 2. Expand 'status' allowed values to include 'Reversed'
-- 3. Update RPC to reflect these changes
-- ================================================================

DO $$ 
BEGIN 
    -- 1. Rename column if it exists as 'note' and 'notes' doesn't exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='note') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='notes') THEN 
        ALTER TABLE public.payments RENAME COLUMN note TO notes; 
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='notes') THEN
        ALTER TABLE public.payments ADD COLUMN notes TEXT;
    END IF;

    -- 2. Update status constraint
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('Allocated', 'Unallocated', 'Reversed', 'Test'));

END $$;

-- 3. Update the RPC function to use 'notes'
CREATE OR REPLACE FUNCTION public.allocate_manual_payment(
  p_payment_id   TEXT,
  p_loan_id      TEXT,
  p_allocated_by TEXT,
  p_note         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount       NUMERIC;
  v_cust_id      TEXT;
  v_cust_name    TEXT;
  v_status       TEXT;
  v_new_bal      NUMERIC;
  v_old_bal      NUMERIC;
  v_old_status   TEXT;
BEGIN
  SELECT amount, status, customer_id, customer_name
    INTO v_amount, v_status, v_cust_id, v_cust_name
    FROM payments
   WHERE id = p_payment_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  IF v_status = 'Allocated' THEN
    RAISE EXCEPTION 'Payment % is already allocated', p_payment_id;
  END IF;

  -- Fetch canonical customer name from customers table instead of loans (which might be NULL)
  SELECT l.balance, l.status, l.customer_id, c.name
    INTO v_old_bal, v_old_status, v_cust_id, v_cust_name
    FROM public.loans l
    JOIN public.customers c ON l.customer_id = c.id
   WHERE l.id = p_loan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', p_loan_id;
  END IF;

  v_new_bal := GREATEST(0, v_old_bal - v_amount);

  UPDATE payments
     SET status       = 'Allocated',
         loan_id      = p_loan_id,
         customer_id  = v_cust_id,
         customer_name = v_cust_name,
         allocated_by = p_allocated_by,
         allocated_at = NOW(),
         notes        = p_note  -- Updated to 'notes'
   WHERE id = p_payment_id;

  UPDATE loans
     SET balance = v_new_bal,
         status  = CASE WHEN v_new_bal <= 0 THEN 'Settled' ELSE v_old_status END
   WHERE id = p_loan_id;

  DELETE FROM unallocated_payments WHERE transaction_id = (SELECT mpesa FROM payments WHERE id = p_payment_id);

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'loan_id', p_loan_id,
    'old_balance', v_old_bal,
    'new_balance', v_new_bal
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
