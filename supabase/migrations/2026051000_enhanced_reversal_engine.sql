-- Migration: Enhanced Reversal Engine with Callback Support
-- 1. Add tracking columns
-- 2. Update status constraints
-- 3. Implement Phase-aware Reversal RPC

DO $$ 
BEGIN 
    -- Add reversal_id to payments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='reversal_id') THEN
        ALTER TABLE public.payments ADD COLUMN reversal_id TEXT;
    END IF;

    -- Add reversal_id to b2c_disbursements
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='b2c_disbursements' AND column_name='reversal_id') THEN
        ALTER TABLE public.b2c_disbursements ADD COLUMN reversal_id TEXT;
    END IF;

    -- Update payments status check
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
    ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('Allocated', 'Unallocated', 'Reversed', 'Pending Reversal', 'Reversal Failed', 'Test'));
END $$;

-- Refined Reversal Engine
CREATE OR REPLACE FUNCTION public.manage_reversal(
    p_phase TEXT,        -- 'INITIATE', 'COMPLETE', 'FAIL'
    p_type  TEXT,        -- 'payment' or 'disbursement'
    p_id    TEXT,        -- Transaction ID (for INITIATE) or Reversal ID (for COMPLETE/FAIL)
    p_reason TEXT DEFAULT NULL,
    p_reversal_id TEXT DEFAULT NULL -- The ConversationID from Safaricom
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record_id TEXT;
    v_loan_id   TEXT;
    v_amount    DECIMAL;
    v_status    TEXT;
BEGIN
    -- PHASE 1: INITIATION (Called by mpesa-reversal function)
    IF p_phase = 'INITIATE' THEN
        IF p_type = 'payment' THEN
            UPDATE public.payments 
            SET status = 'Pending Reversal',
                reversal_id = p_reversal_id,
                notes = COALESCE(notes, '') || ' | REVERSAL INITIATED: ' || COALESCE(p_reason, 'No reason')
            WHERE id = p_id;
            IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Payment not found'); END IF;
        ELSE
            UPDATE public.b2c_disbursements 
            SET status = 'Pending Reversal',
                reversal_id = p_reversal_id,
                result_desc = COALESCE(result_desc, '') || ' | REVERSAL INITIATED: ' || COALESCE(p_reason, 'No reason')
            WHERE id = p_id;
            IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Disbursement not found'); END IF;
        END IF;
        
        RETURN jsonb_build_object('success', true, 'message', 'Reversal marked as pending');

    -- PHASE 2: COMPLETION (Called by mpesa-reversal-callback on Success)
    ELSIF p_phase = 'COMPLETE' THEN
        IF p_type = 'payment' THEN
            -- Find the record by reversal_id
            SELECT id, loan_id, amount, status INTO v_record_id, v_loan_id, v_amount, v_status
            FROM public.payments WHERE reversal_id = p_id; -- In this phase, p_id is the reversal_id (ConvID)

            IF v_record_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Payment record not found for this reversal ID'); END IF;
            IF v_status = 'Reversed' THEN RETURN jsonb_build_object('success', true, 'message', 'Already reversed'); END IF;

            -- Undo the balance reduction in Loans
            IF v_loan_id IS NOT NULL THEN
                UPDATE public.loans 
                SET balance = balance + v_amount,
                    status = CASE WHEN status = 'Settled' THEN 'Active' ELSE status END
                WHERE id = v_loan_id;
            END IF;

            -- Update Payment Status to Final
            UPDATE public.payments SET status = 'Reversed' WHERE id = v_record_id;

        ELSE -- disbursement
            SELECT id, loan_id, amount, status INTO v_record_id, v_loan_id, v_amount, v_status
            FROM public.b2c_disbursements WHERE reversal_id = p_id;

            IF v_record_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Disbursement record not found for this reversal ID'); END IF;
            IF v_status = 'Reversed' THEN RETURN jsonb_build_object('success', true, 'message', 'Already reversed'); END IF;

            -- Undo the balance increase
            IF v_loan_id IS NOT NULL THEN
                UPDATE public.loans 
                SET balance = GREATEST(balance - v_amount, 0),
                    status = CASE WHEN balance - v_amount <= 0 THEN 'Approved' ELSE status END
                WHERE id = v_loan_id;
            END IF;

            -- Update Disbursement Status to Final
            UPDATE public.b2c_disbursements SET status = 'Reversed' WHERE id = v_record_id;
        END IF;

        INSERT INTO public.audit_log (ts, worker_name, action, target_id, summary)
        VALUES (NOW(), 'M-Pesa Callback', 'Reversal Completed', v_record_id, 'Type: ' || p_type || ' successful.');

        RETURN jsonb_build_object('success', true);

    -- PHASE 3: FAILURE (Called by mpesa-reversal-callback on Failure)
    ELSIF p_phase = 'FAIL' THEN
        IF p_type = 'payment' THEN
            UPDATE public.payments 
            SET status = 'Reversal Failed',
                notes = COALESCE(notes, '') || ' | REVERSAL FAILED: ' || COALESCE(p_reason, 'Safaricom error')
            WHERE reversal_id = p_id;
        ELSE
            UPDATE public.b2c_disbursements 
            SET status = 'Reversal Failed',
                result_desc = COALESCE(result_desc, '') || ' | REVERSAL FAILED: ' || COALESCE(p_reason, 'Safaricom error')
            WHERE reversal_id = p_id;
        END IF;

        RETURN jsonb_build_object('success', true, 'message', 'Reversal failure logged');

    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Invalid phase');
    END IF;
END;
$$;
