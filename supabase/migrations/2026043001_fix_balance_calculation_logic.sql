-- ================================================================
-- MIGRATION: Fix Balance Calculation Logic (Interest + Penalties)
-- Ensures automated reminders and callbacks report the full liability.
-- Formula: (Principal + 30% Interest + Accrued Penalty) - Total Paid
-- ================================================================

-- 1. Update get_reminder_queue to use the robust formula
CREATE OR REPLACE FUNCTION public.get_reminder_queue(p_hour INT)
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
            l.id as lid,
            l.customer_name as cname,
            c.phone as cphone,
            l.amount as l_principal,
            l.disbursed as l_disbursed,
            l.repayment_type as l_repay_type,
            (
                -- FORMULA: (Principal + 30% Interest) + Accrued Penalty - Total Paid
                (l.amount * 1.3) -- Principal + 30% Interest
                + (
                    CASE 
                        WHEN l.disbursed IS NOT NULL THEN
                            ROUND(
                                (l.amount * 1.3) * 0.012 * 
                                LEAST(GREATEST(0, (CURRENT_DATE - (l.disbursed + INTERVAL '30 days')::DATE)), 60)
                            )
                        ELSE 0
                    END
                )
                - (
                    SELECT COALESCE(SUM(p.amount), 0)
                    FROM payments p
                    WHERE p.loan_id = l.id AND p.status = 'Allocated'
                )
            ) as total_liability,
            (l.disbursed + INTERVAL '30 days')::DATE as final_due_date,
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
    )
    SELECT
        ld.cid, ld.lid, ld.cname, ld.cphone, ld.total_liability::DECIMAL,
        ld.final_due_date, ld.l_repay_type,
        CASE
            WHEN p_hour = 7 THEN
                CASE
                    WHEN ld.l_repay_type = 'Daily' AND NOT ld.paid_today THEN 'morning_reminder'
                    WHEN ld.l_repay_type != 'Daily' AND (
                        (ld.l_repay_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.l_repay_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'morning_reminder'
                    ELSE NULL
                END
            WHEN p_hour = 19 THEN
                CASE
                    WHEN ld.l_repay_type = 'Daily' AND NOT ld.paid_today THEN 'evening_alert'
                    WHEN ld.l_repay_type != 'Daily' AND (
                        (ld.l_repay_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                        (ld.l_repay_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                        (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'pre_due_reminder'
                    WHEN ld.l_repay_type != 'Daily' AND NOT ld.paid_today AND (
                        (ld.l_repay_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.l_repay_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'evening_alert'
                    ELSE NULL
                END
            ELSE NULL
        END as m_type
    FROM loan_data ld
    WHERE ld.total_liability > 0 AND (
        CASE
            WHEN p_hour = 7 THEN (
                (ld.l_repay_type = 'Daily' AND NOT ld.paid_today) OR
                (ld.l_repay_type != 'Daily' AND (
                    (ld.l_repay_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                    (ld.l_repay_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                    (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                ))
            )
            WHEN p_hour = 19 THEN (
                (ld.l_repay_type = 'Daily' AND NOT ld.paid_today) OR
                (ld.l_repay_type != 'Daily' AND (
                    (ld.l_repay_type = 'Weekly'   AND (ld.tomorrow - ld.start_date) % 7  = 0) OR
                    (ld.l_repay_type = 'Biweekly' AND (ld.tomorrow - ld.start_date) % 14 = 0) OR
                    (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.tomorrow) = EXTRACT(DAY FROM ld.start_date)) OR
                    (NOT ld.paid_today AND (
                        (ld.l_repay_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.l_repay_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.l_repay_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ))
                ))
            )
            ELSE FALSE
        END
    );
END;
$$;
