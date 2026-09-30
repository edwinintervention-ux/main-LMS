CREATE OR REPLACE FUNCTION public.manage_reversal(
    p_phase TEXT,        
    p_type  TEXT,        
    p_id    TEXT,        
    p_reason TEXT DEFAULT NULL,
    p_reversal_id TEXT DEFAULT NULL 
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

    ELSIF p_phase = 'COMPLETE' THEN
        IF p_type = 'payment' THEN
            SELECT id, loan_id, amount, status INTO v_record_id, v_loan_id, v_amount, v_status
            FROM public.payments WHERE reversal_id = p_id;

            IF v_record_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Payment record not found for this reversal ID'); END IF;
            IF v_status = 'Reversed' THEN RETURN jsonb_build_object('success', true, 'message', 'Already reversed'); END IF;

            IF v_loan_id IS NOT NULL THEN
                UPDATE public.loans 
                SET balance = balance + v_amount,
                    status = CASE WHEN status = 'Settled' THEN 'Active' ELSE status END
                WHERE id = v_loan_id;
            END IF;

            UPDATE public.payments SET status = 'Reversed' WHERE id = v_record_id;

        ELSE 
            SELECT id, loan_id, amount, status INTO v_record_id, v_loan_id, v_amount, v_status
            FROM public.b2c_disbursements WHERE reversal_id = p_id;

            IF v_record_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Disbursement record not found for this reversal ID'); END IF;
            IF v_status = 'Reversed' THEN RETURN jsonb_build_object('success', true, 'message', 'Already reversed'); END IF;

            IF v_loan_id IS NOT NULL THEN
                UPDATE public.loans 
                SET balance = GREATEST(balance - v_amount, 0),
                    status = CASE WHEN balance - v_amount <= 0 THEN 'Approved' ELSE status END
                WHERE id = v_loan_id;
            END IF;

            UPDATE public.b2c_disbursements SET status = 'Reversed' WHERE id = v_record_id;
        END IF;

        -- FIXED: Used user_name and detail instead of worker_name and summary
        INSERT INTO public.audit_log (ts, user_name, action, target_id, detail)
        VALUES (NOW(), 'M-Pesa Callback', 'Reversal Completed', v_record_id, 'Type: ' || p_type || ' successful.');

        RETURN jsonb_build_object('success', true);

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
