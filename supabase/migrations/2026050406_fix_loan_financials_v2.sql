
-- ================================================================
-- MIGRATION: Fix Loan Financials (Interest + Penalties)
-- Focus: Ensures the 'balance' column correctly includes interest, 
-- and that reminders reflect the full liability (Principal + Interest + Penalties).
-- ================================================================

-- 1. Remove the restrictive balance constraint that prevented interest from being included
ALTER TABLE public.loans DROP CONSTRAINT IF EXISTS loans_balance_check;

-- 2. Backfill existing Active/Overdue loans to include the 30% interest in their balance.
-- We only apply this to loans where the current balance is still at or below the principal (amount).
UPDATE public.loans 
SET balance = ROUND(balance + (amount * 0.3))
WHERE status IN ('Active', 'Overdue') 
  AND (balance <= amount OR balance IS NULL);

-- 3. Update the Master Trigger to ensure loans don't settle until EVERYTHING is paid.
CREATE OR REPLACE FUNCTION public.apply_payment_to_loan() 
RETURNS TRIGGER AS $$
DECLARE
    p_amount     DECIMAL := NEW.amount;
    l_penalties  DECIMAL;
    l_balance    DECIMAL;
    l_disbursed  DATE;
    l_status     TEXT;
BEGIN
    -- Only process if payment is Allocated to a valid loan
    IF NEW.loan_id IS NULL OR NEW.status != 'Allocated' THEN
        RETURN NEW;
    END IF;

    -- A) Get current state
    SELECT penalties, balance, disbursed, status 
      INTO l_penalties, l_balance, l_disbursed, l_status
      FROM public.loans 
     WHERE id = NEW.loan_id FOR UPDATE;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- B) WATERFALL: PAY OFF PENALTIES FIRST
    IF l_penalties > 0 THEN
        IF p_amount >= l_penalties THEN
            p_amount := p_amount - l_penalties;
            l_penalties := 0;
        ELSE
            l_penalties := l_penalties - p_amount;
            p_amount := 0;
        END IF;
    END IF;

    -- C) WATERFALL: PAY OFF BALANCE (PRINCIPAL + INTEREST) SECOND
    IF p_amount > 0 THEN
        l_balance := GREATEST(l_balance - p_amount, 0);
    END IF;

    -- D) APPLY UPDATES TO LOAN
    UPDATE public.loans 
       SET balance   = l_balance,
           penalties = l_penalties,
           status    = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN 'Settled'::text ELSE l_status END,
           settled_at = CASE WHEN (l_balance <= 0 AND l_penalties <= 0) THEN NOW() ELSE settled_at END
     WHERE id = NEW.loan_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update get_reminder_queue to return the full unified balance
-- We DROP first because the return signature (columns) has changed from earlier versions.
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
            CURRENT_DATE as today,
            (CURRENT_DATE + INTERVAL '1 day')::DATE as tomorrow,
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
                  AND p.date::DATE = CURRENT_DATE
            ) as paid_today
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
                    WHEN ld.r_type = 'Daily' AND NOT ld.paid_today THEN 'morning_reminder'
                    WHEN ld.r_type != 'Daily' AND (
                        (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                        (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                        (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                    ) THEN 'morning_reminder'
                    ELSE NULL
                END
            WHEN p_hour = 19 THEN
                CASE
                    WHEN ld.r_type = 'Daily' AND NOT ld.paid_today THEN 'evening_alert'
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
                (ld.r_type = 'Daily' AND NOT ld.paid_today) OR
                (ld.r_type != 'Daily' AND (
                    (ld.r_type = 'Weekly'   AND (ld.today - ld.start_date) % 7  = 0) OR
                    (ld.r_type = 'Biweekly' AND (ld.today - ld.start_date) % 14 = 0) OR
                    (ld.r_type = 'Monthly'  AND EXTRACT(DAY FROM ld.today) = EXTRACT(DAY FROM ld.start_date))
                ))
            )
            WHEN p_hour = 19 THEN (
                (ld.r_type = 'Daily' AND NOT ld.paid_today) OR
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
