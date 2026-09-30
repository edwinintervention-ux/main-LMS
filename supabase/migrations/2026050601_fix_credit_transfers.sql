-- ================================================================
-- MIGRATION: Fix Credit Transfers & Payment Constraints
-- 1. Allow negative payments (for internal credit transfers/adjustments)
-- 2. Fix RPC type mismatch (TEXT id vs UUID param)
-- ================================================================

-- ── 1. Update Payments Constraint ──
-- Drop the restrictive "amount > 0" check to allow negative adjustment entries
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount <> 0);

-- ── 2. Fix allocate_manual_payment RPC ──
-- The payments table uses TEXT for IDs (PAY-0001), not UUID.
-- We must redefine the function with the correct parameter type.
-- Drop old overloads to prevent ambiguity
DROP FUNCTION IF EXISTS public.allocate_manual_payment(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.allocate_manual_payment(TEXT, TEXT, TEXT, TEXT);

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
  -- 1. Fetch and Lock the payment
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

  -- 2. Fetch and Lock the loan
  SELECT balance, status, customer_id, customer_name
    INTO v_old_bal, v_old_status, v_cust_id, v_cust_name
    FROM loans
   WHERE id = p_loan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', p_loan_id;
  END IF;

  -- 3. Calculate new balance
  -- Note: v_amount can be negative for adjustments, so subtracting it works correctly:
  -- old_bal - (-200) = old_bal + 200 (increases balance)
  -- old_bal - (500)  = old_bal - 500 (decreases balance)
  v_new_bal := GREATEST(0, v_old_bal - v_amount);

  -- 4. Update the payment
  UPDATE payments
     SET status       = 'Allocated',
         loan_id      = p_loan_id,
         customer_id  = v_cust_id,
         customer_name = v_cust_name,
         allocated_by = p_allocated_by,
         allocated_at = NOW(),
         note         = p_note
   WHERE id = p_payment_id;

  -- 5. Update the loan
  UPDATE loans
     SET balance = v_new_bal,
         status  = CASE WHEN v_new_bal <= 0 THEN 'Settled' ELSE v_old_status END
   WHERE id = p_loan_id;

  -- 6. Clean up unallocated_payments if it exists there
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

-- Grant permissions back with explicit types to resolve ambiguity
GRANT EXECUTE ON FUNCTION public.allocate_manual_payment(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_manual_payment(TEXT, TEXT, TEXT, TEXT) TO authenticated;
