-- ================================================================
-- MIGRATION: Undo Specific Payment Allocation (Reversal for Test)
-- Target: KSh 1 payment for Donald Barare Osiemo
-- Goal: Set back to 'Unallocated' and restore loan balance to verify fix.
-- ================================================================

DO $$ 
DECLARE
    v_pay_id   TEXT;
    v_loan_id  TEXT;
    v_amount   NUMERIC;
    v_old_bal  NUMERIC;
BEGIN 
    -- 1. Identify current state (latest 1 bob payment)
    SELECT id, loan_id, amount INTO v_pay_id, v_loan_id, v_amount
      FROM public.payments 
     WHERE amount = 1 
       AND status = 'Allocated'
     ORDER BY date DESC LIMIT 1;

    IF v_pay_id IS NOT NULL AND v_loan_id IS NOT NULL THEN
        -- 2. Restore Loan Balance
        SELECT balance INTO v_old_bal FROM public.loans WHERE id = v_loan_id FOR UPDATE;
        
        UPDATE public.loans 
           SET balance = v_old_bal + v_amount,
               status = 'Active' -- Ensure it's not 'Settled'
         WHERE id = v_loan_id;

        -- 3. Revert Payment
        UPDATE public.payments 
           SET status = 'Unallocated',
               loan_id = NULL,
               allocated_by = NULL,
               allocated_at = NULL
         WHERE id = v_pay_id;
         
        RAISE NOTICE 'Successfully reverted allocation for % (Amount: %). Loan % balance increased.', v_pay_id, v_amount, v_loan_id;
    ELSE
        RAISE NOTICE 'Payment % is already unallocated or not found.', v_pay_id;
    END IF;
END $$;
