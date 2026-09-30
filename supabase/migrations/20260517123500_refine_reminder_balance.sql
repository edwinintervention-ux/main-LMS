-- ================================================================
-- MIGRATION: Refine Reminder Balance
-- Goal: Ensure the SMS procedure calculates overdue interest and penalties 
-- exactly matching the frontend's calculateLoanStatus function.
-- ================================================================

CREATE OR REPLACE FUNCTION public.queue_daily_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_loan RECORD;
    v_message TEXT;
    v_send_at TIMESTAMPTZ;
    v_account_no TEXT;
    v_days_since_pay INT;
    v_due_date DATE;
    v_od INT;
    v_capped_od INT;
    v_penalty INT;
    v_base_total NUMERIC;
    v_total_balance NUMERIC;
BEGIN
    -- Set the send time to 7 AM of the current day
    v_send_at := (CURRENT_DATE AT TIME ZONE 'Africa/Nairobi') + INTERVAL '7 hours';

    FOR v_loan IN
        SELECT
            l.id as loan_id,
            l.amount as amount,
            l.balance as balance,
            l.disbursed as disbursed,
            c.id::TEXT as customer_id,
            c.name as customer_name,
            c.phone as phone,
            COALESCE(c.account_number, c.id_no, c.id_number, l.id) as acct_ref,
            COALESCE(
                (SELECT ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - MAX(date::DATE)) 
                 FROM payments p 
                 WHERE p.loan_id = l.id AND p.status = 'Allocated'),
                ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - l.disbursed::DATE)
            ) as days_since_pay
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status IN ('Active', 'Overdue')
          AND l.repayment_type = 'Daily'
          AND l.balance > 0
    LOOP
        v_days_since_pay := v_loan.days_since_pay;
        
        -- Calculate real-time dynamic penalties matching calculateLoanStatus
        v_base_total := v_loan.amount * 1.3;
        v_due_date := (v_loan.disbursed::DATE + INTERVAL '30 days')::DATE;
        v_od := (now() AT TIME ZONE 'Africa/Nairobi')::DATE - v_due_date;
        
        IF v_od < 0 THEN
            v_od := 0;
        END IF;
        
        v_capped_od := LEAST(v_od, 60);
        v_penalty := ROUND(v_base_total * 0.012 * v_capped_od);
        v_total_balance := v_loan.balance + v_penalty;
        
        -- If days_since_pay is 3 at 00:30 AM, it means they missed 2 full previous days.
        IF v_days_since_pay = 3 THEN
            v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) || ', you have missed your partial payments. Your balance is KES ' || to_char(v_total_balance, 'FM999,999,999') || '. Please pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';

            -- Ensure we don't queue duplicates for the same loan on the same day
            IF NOT EXISTS (
                SELECT 1 FROM public.queued_sms 
                WHERE loan_id = v_loan.loan_id 
                  AND status = 'queued' 
                  AND send_at::DATE = v_send_at::DATE
            ) THEN
                INSERT INTO public.queued_sms (customer_id, loan_id, message, send_at)
                VALUES (v_loan.customer_id, v_loan.loan_id, v_message, v_send_at);
            END IF;
        END IF;
    END LOOP;
END;
$$;
