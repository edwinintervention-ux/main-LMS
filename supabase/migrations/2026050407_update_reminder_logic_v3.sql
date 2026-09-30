
-- ================================================================
-- MIGRATION: Update SMS Reminder Logic
-- Goal: Cease daily reminders. Send a reminder only on the 3rd day 
-- of missed partial payments for 'Daily' repayment types.
-- ================================================================

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
    message_type TEXT,
    account_number TEXT,
    installment_amount DECIMAL
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH loan_data AS (
        SELECT
            c.id::TEXT as cid,
            l.id as lid,
            l.customer_name as cname,
            c.phone as cphone,
            (l.balance + COALESCE(l.penalties, 0)) as total_balance,
            (l.disbursed::TIMESTAMPTZ + INTERVAL '30 days')::DATE as final_due_date,
            l.repayment_type as r_type,
            l.disbursed::DATE as start_date,
            (now() AT TIME ZONE 'Africa/Nairobi')::DATE as today,
            ((now() AT TIME ZONE 'Africa/Nairobi')::DATE + INTERVAL '1 day')::DATE as tomorrow,
            c.id_no as account_no,
            ROUND((l.amount * 1.3) / CASE 
                WHEN l.repayment_type = 'Daily' THEN 30 
                WHEN l.repayment_type = 'Weekly' THEN 4 
                WHEN l.repayment_type = 'Biweekly' THEN 2 
                ELSE 1 
            END, 0) as inst_amount,
            EXISTS (
                SELECT 1 FROM payments p
                WHERE p.loan_id = l.id
                  AND p.status = 'Allocated'
                  AND p.date::DATE = (now() AT TIME ZONE 'Africa/Nairobi')::DATE
            ) as paid_today,
            COALESCE(
                (SELECT ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - MAX(date::DATE)) 
                 FROM payments p 
                 WHERE p.loan_id = l.id AND p.status = 'Allocated'),
                ((now() AT TIME ZONE 'Africa/Nairobi')::DATE - l.disbursed::DATE)
            ) as days_since_pay
        FROM loans l
        JOIN customers c ON l.customer_id = c.id
        WHERE l.status IN ('Active', 'Overdue')
          AND (l.balance + COALESCE(l.penalties, 0)) > 0
    )
    SELECT
        ld.cid, ld.lid, ld.cname, ld.cphone, ld.total_balance,
        ld.final_due_date, ld.r_type,
        CASE
            WHEN p_hour = 7 THEN
                CASE
                    -- Daily morning reminders CEASED
                    WHEN ld.r_type = 'Daily' THEN NULL
                    -- Other reminders (Weekly, Biweekly, Monthly) remain
                    WHEN ld.r_type != 'Daily' AND (
                        (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'morning_reminder'
                    ELSE NULL
                END
            WHEN p_hour = 19 THEN
                CASE
                    -- Daily evening reminders only on the 3rd day of no payment
                    WHEN ld.r_type = 'Daily' AND ld.days_since_pay = 3 THEN 'missed_3_days_alert'
                    
                    -- Other reminders (Weekly, Biweekly, Monthly) remain
                    WHEN ld.r_type != 'Daily' AND (
                        (ld.r_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                        (ld.r_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                        (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'pre_due_reminder'
                    WHEN ld.r_type != 'Daily' AND NOT ld.paid_today AND (
                        (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'evening_alert'
                    ELSE NULL
                END
            ELSE NULL
        END as m_type,
        ld.account_no,
        ld.inst_amount
    FROM loan_data ld
    WHERE (
        CASE
            WHEN p_hour = 7 THEN (
                -- Daily morning reminders CEASED
                (ld.r_type != 'Daily' AND (
                    (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                    (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                    (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                ))
            )
            WHEN p_hour = 19 THEN (
                -- Daily evening reminders only on the 3rd day of no payment
                (ld.r_type = 'Daily' AND ld.days_since_pay = 3) OR
                -- Other reminders remain
                (ld.r_type != 'Daily' AND (
                    (ld.r_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                    (ld.r_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                    (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date)) OR
                    (NOT ld.paid_today AND (
                        (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ))
                ))
            )
            ELSE FALSE
        END
    );
END;
$$;
