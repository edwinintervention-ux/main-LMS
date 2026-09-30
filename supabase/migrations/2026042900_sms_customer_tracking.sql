-- ================================================================
-- MIGRATION: SMS Customer Tracking
-- 1. Add customer_id to sms_logs so messages are tied to accounts
-- 2. Update get_reminder_queue to include customer_id
-- ================================================================

-- 1. Add customer_id column to sms_logs
ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS customer_id TEXT;
CREATE INDEX IF NOT EXISTS sms_logs_customer_id_idx ON public.sms_logs (customer_id);

-- 2. Recreate get_reminder_queue with customer_id included in output
DROP FUNCTION IF EXISTS public.get_reminder_queue(INT);

CREATE FUNCTION public.get_reminder_queue(p_hour INT)
RETURNS TABLE (
    customer_id TEXT,
    loan_id TEXT,
    customer_name TEXT,
    phone TEXT,
    balance DECIMAL,
    due_date DATE,
    repayment_type TEXT,
    message_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH loan_data AS (
        SELECT
            c.id::TEXT as cid,
            l.id,
            l.customer_name,
            c.phone,
            l.balance,
            (l.disbursed + INTERVAL '30 days')::DATE as final_due_date,
            l.repayment_type,
            l.disbursed::DATE as start_date,
            CURRENT_DATE as today,
            (CURRENT_DATE + INTERVAL '1 day')::DATE as tomorrow,
            EXISTS (
                SELECT 1 FROM payments p
                WHERE p.loan_id = l.id
                  AND p.status = 'Allocated'
                  AND p.date = CURRENT_DATE
            ) as paid_today
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status IN ('Active', 'Overdue')
          AND l.balance > 0
    )
    SELECT
        ld.cid, ld.id, ld.customer_name, ld.phone, ld.balance,
        ld.final_due_date, ld.repayment_type,
        CASE
            WHEN p_hour = 7 THEN
                CASE
                    WHEN ld.repayment_type = 'Daily' AND NOT ld.paid_today THEN 'morning_reminder'
                    WHEN ld.repayment_type != 'Daily' AND (
                        (ld.repayment_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.repayment_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'morning_reminder'
                    ELSE NULL
                END
            WHEN p_hour = 19 THEN
                CASE
                    WHEN ld.repayment_type = 'Daily' AND NOT ld.paid_today THEN 'evening_alert'
                    WHEN ld.repayment_type != 'Daily' AND (
                        (ld.repayment_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                        (ld.repayment_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                        (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'pre_due_reminder'
                    WHEN ld.repayment_type != 'Daily' AND NOT ld.paid_today AND (
                        (ld.repayment_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.repayment_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'evening_alert'
                    ELSE NULL
                END
            ELSE NULL
        END as m_type
    FROM loan_data ld
    WHERE (
        CASE
            WHEN p_hour = 7 THEN (
                (ld.repayment_type = 'Daily' AND NOT ld.paid_today) OR
                (ld.repayment_type != 'Daily' AND (
                    (ld.repayment_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                    (ld.repayment_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                    (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                ))
            )
            WHEN p_hour = 19 THEN (
                (ld.repayment_type = 'Daily' AND NOT ld.paid_today) OR
                (ld.repayment_type != 'Daily' AND (
                    (ld.repayment_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                    (ld.repayment_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                    (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date)) OR
                    (NOT ld.paid_today AND (
                        (ld.repayment_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.repayment_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.repayment_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ))
                ))
            )
            ELSE FALSE
        END
    );
END;
$$;
