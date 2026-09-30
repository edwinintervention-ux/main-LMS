-- ================================================================
-- MIGRATION: Daily Reminder Generation Logic
-- Goal: Automatically evaluate Daily loans and queue SMS reminders
-- for customers who have missed 2 consecutive payments.
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
BEGIN
    -- Set the send time to 7 AM of the current day (since this runs at 00:30 AM)
    v_send_at := (CURRENT_DATE AT TIME ZONE 'Africa/Nairobi') + INTERVAL '7 hours';

    FOR v_loan IN
        SELECT
            l.id as loan_id,
            c.id::TEXT as customer_id,
            c.name as customer_name,
            c.phone as phone,
            (l.balance + COALESCE(l.penalties, 0)) as total_balance,
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
          AND (l.balance + COALESCE(l.penalties, 0)) > 0
    LOOP
        v_days_since_pay := v_loan.days_since_pay;
        
        -- If days_since_pay is 3 at 00:30 AM, it means they missed 2 full previous days.
        IF v_days_since_pay = 3 THEN
            v_message := 'Dear ' || split_part(v_loan.customer_name, ' ', 1) || ', you have missed your partial payments. Your balance is KES ' || to_char(v_loan.total_balance, 'FM999,999,999') || '. Please pay via Paybill 4166191, Account: ' || v_loan.acct_ref || '. Thank you.';

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

-- Schedule the job to run every day at 00:30 AM
SELECT cron.schedule(
    'queue-daily-reminders',
    '30 0 * * *',
    'SELECT public.queue_daily_reminders()'
);
