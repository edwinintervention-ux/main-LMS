-- Migration: Automated Limit Scaling and Arrears Suspension Rules
-- Created: 2026-05-20
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add credit limit suspension tracking columns to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS limit_suspended BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS suspended_baseline_limit NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_overdue_clear_date TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Recreate customer_risk_profiles view with dynamic overdue scaling and suspension
DROP VIEW IF EXISTS public.customer_risk_profiles;

CREATE VIEW public.customer_risk_profiles
  WITH (security_invoker = true)
AS
WITH loan_metrics AS (
    SELECT
        customer_id,
        COUNT(*)                                          AS total_loans,
        COUNT(*) FILTER (WHERE status = 'Settled')        AS settled_loans,
        COUNT(*) FILTER (WHERE status = 'Overdue')        AS currently_overdue_count,
        GREATEST(
            COALESCE(MAX(days_overdue), 0),
            CASE WHEN COUNT(*) FILTER (WHERE status = 'Overdue') > 0
                 THEN 1 ELSE 0 END
        )                                                 AS max_overdue_days,
        SUM(balance)                                      AS total_outstanding,
        SUM(amount)                                       AS total_borrowed
    FROM public.loans
    GROUP BY customer_id
),
payment_metrics AS (
    SELECT
        customer_id,
        COUNT(*)        AS payment_count,
        MAX(date)       AS last_payment_date,
        SUM(amount)     AS total_repaid
    FROM public.payments
    WHERE status = 'Allocated'
    GROUP BY customer_id
)
SELECT
    c.id                                          AS customer_id,
    c.name                                        AS customer_name,
    c.limit_suspended                             AS limit_suspended,
    c.suspended_baseline_limit                    AS suspended_baseline_limit,
    c.last_overdue_clear_date                     AS last_overdue_clear_date,
    COALESCE(lm.total_loans, 0)                   AS total_loans,
    COALESCE(lm.settled_loans, 0)                 AS settled_loans,
    COALESCE(lm.currently_overdue_count, 0)       AS currently_overdue_count,
    COALESCE(lm.max_overdue_days, 0)              AS max_overdue_days,
    COALESCE(lm.total_outstanding, 0)             AS total_outstanding,
    COALESCE(pm.payment_count, 0)                 AS payment_count,

    -- ── Current Limit (Dynamic Tier Reductions) ─────────────────────────────
    CASE
        WHEN c.limit_suspended = TRUE THEN 0
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0 THEN
            CASE
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 1 AND 5   THEN ROUND(c.credit_limit * 0.95)
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 6 AND 10  THEN ROUND(c.credit_limit * 0.90)
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 11 AND 15 THEN ROUND(c.credit_limit * 0.85)
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 16 AND 20 THEN ROUND(c.credit_limit * 0.80)
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 21 AND 25 THEN ROUND(c.credit_limit * 0.75)
                WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 26 AND 30 THEN ROUND(c.credit_limit * 0.70)
                ELSE 0 -- Overdue for > 30 days is dynamically 0
            END
        ELSE c.credit_limit
    END                                           AS current_limit,

    -- ── Risk Rating ────────────────────────────────────────────────────────
    CASE
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0
             AND COALESCE(lm.max_overdue_days, 0) > 30  THEN 'Critical'
        WHEN COALESCE(lm.max_overdue_days, 0) > 30      THEN 'Critical'
        WHEN COALESCE(lm.max_overdue_days, 0) > 14      THEN 'High'
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0
             OR COALESCE(lm.max_overdue_days, 0) > 0    THEN 'Medium'
        WHEN COALESCE(lm.total_loans, 0) > 3
             AND COALESCE(lm.max_overdue_days, 0) = 0   THEN 'A+'
        WHEN COALESCE(lm.total_loans, 0) > 0
             AND COALESCE(lm.max_overdue_days, 0) = 0   THEN 'Low'
        ELSE 'New'
    END                                           AS calculated_risk,

    -- ── Repayment Style ─────────────────────────────────────────────────────
    CASE
        WHEN pm.payment_count > (lm.total_loans * 4) THEN 'Frequent Partial'
        WHEN pm.payment_count > 0                     THEN 'Standard'
        ELSE 'No History'
    END                                           AS repayment_style,

    -- ── Limit Status ────────────────────────────────────────────────────────
    CASE
        WHEN c.limit_suspended = TRUE THEN 'Suspended (Late Settlement Penalty)'
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0 THEN 'Frozen (Arrears Default Reduced)'
        WHEN COALESCE(lm.total_loans, 0) < 3                          THEN 'Maintain (Entry Phase)'
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0
             OR COALESCE(lm.max_overdue_days, 0) > 0                  THEN 'Frozen (Arrears Detected)'
        WHEN COALESCE(lm.total_loans, 0) >= 3
             AND COALESCE(lm.max_overdue_days, 0) = 0                 THEN 'Eligible for +2000'
        ELSE 'Review Required'
    END                                           AS limit_status,

    -- ── Suggested Limit ─────────────────────────────────────────────────────
    CASE
        WHEN c.limit_suspended = TRUE THEN 0
        WHEN COALESCE(lm.total_loans, 0) >= 3
             AND COALESCE(lm.max_overdue_days, 0) = 0
             AND COALESCE(lm.currently_overdue_count, 0) = 0
             AND c.limit_suspended = FALSE THEN c.credit_limit + 2000
        ELSE
            CASE
                WHEN COALESCE(lm.currently_overdue_count, 0) > 0 THEN
                    CASE
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 1 AND 5   THEN ROUND(c.credit_limit * 0.95)
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 6 AND 10  THEN ROUND(c.credit_limit * 0.90)
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 11 AND 15 THEN ROUND(c.credit_limit * 0.85)
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 16 AND 20 THEN ROUND(c.credit_limit * 0.80)
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 21 AND 25 THEN ROUND(c.credit_limit * 0.75)
                        WHEN COALESCE(lm.max_overdue_days, 0) BETWEEN 26 AND 30 THEN ROUND(c.credit_limit * 0.70)
                        ELSE 0
                    END
                ELSE c.credit_limit
            END
    END                                           AS suggested_limit

FROM public.customers c
LEFT JOIN loan_metrics    lm ON c.id = lm.customer_id
LEFT JOIN payment_metrics pm ON c.id = pm.customer_id;

-- Grant select permission on the view
GRANT SELECT ON public.customer_risk_profiles TO authenticated;
GRANT SELECT ON public.customer_risk_profiles TO service_role;


-- 3. Create Loan Settlement Suspension & Tiered Reduction Trigger & Function
CREATE OR REPLACE FUNCTION public.handle_loan_settlement_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_days_overdue INT;
    v_reduction_pct NUMERIC;
    v_old_limit NUMERIC;
    v_new_limit NUMERIC;
BEGIN
    -- Detect transition to 'Settled'
    IF NEW.status = 'Settled' AND OLD.status != 'Settled' THEN
        -- Calculate actual days overdue at settlement (calendar days)
        v_days_overdue := GREATEST(
            COALESCE(OLD.days_overdue, 0),
            CASE WHEN OLD.expected_completion_date IS NOT NULL 
                 THEN (COALESCE(NEW.settled_at, NOW())::DATE - OLD.expected_completion_date::DATE)::INT
                 ELSE 0 
            END
        );

        -- If it was overdue by more than 30 days, suspend the limit
        IF v_days_overdue > 30 THEN
            UPDATE public.customers
            SET limit_suspended = TRUE,
                suspended_baseline_limit = credit_limit,
                last_overdue_clear_date = COALESCE(NEW.settled_at, NOW()),
                credit_limit = 0
            WHERE id = NEW.customer_id;
            
            -- Log the suspension in audit logs
            INSERT INTO public.audit_logs (user_id, user_label, action, target, detail)
            VALUES (
                NULL,
                'system',
                'LIMIT_SUSPENDED',
                NEW.customer_id,
                'Credit limit suspended permanently due to critical default (>30 days overdue). Loan ID: ' || NEW.id
            );
            
        -- Apply permanent tiered reduction for overdue between 1 and 30 days
        ELSIF v_days_overdue >= 1 THEN
            IF v_days_overdue BETWEEN 1 AND 5 THEN
                v_reduction_pct := 0.95;
            ELSIF v_days_overdue BETWEEN 6 AND 10 THEN
                v_reduction_pct := 0.90;
            ELSIF v_days_overdue BETWEEN 11 AND 15 THEN
                v_reduction_pct := 0.85;
            ELSIF v_days_overdue BETWEEN 16 AND 20 THEN
                v_reduction_pct := 0.80;
            ELSIF v_days_overdue BETWEEN 21 AND 25 THEN
                v_reduction_pct := 0.75;
            ELSIF v_days_overdue BETWEEN 26 AND 30 THEN
                v_reduction_pct := 0.70;
            ELSE
                v_reduction_pct := 1.0;
            END IF;

            -- Get current credit limit
            SELECT credit_limit INTO v_old_limit FROM public.customers WHERE id = NEW.customer_id;
            v_new_limit := ROUND(v_old_limit * v_reduction_pct);

            UPDATE public.customers
            SET credit_limit = v_new_limit,
                last_overdue_clear_date = COALESCE(NEW.settled_at, NOW())
            WHERE id = NEW.customer_id;
            
            -- Log the permanent reduction
            INSERT INTO public.audit_logs (user_id, user_label, action, target, detail)
            VALUES (
                NULL,
                'system',
                'LIMIT_REDUCED',
                NEW.customer_id,
                'Credit limit permanently reduced from ' || v_old_limit || ' to ' || v_new_limit || ' (' || ROUND((1 - v_reduction_pct) * 100) || '% reduction) due to settling late by ' || v_days_overdue || ' day(s). Loan ID: ' || NEW.id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_loan_settlement ON public.loans;
CREATE TRIGGER trg_loan_settlement
AFTER UPDATE OF status ON public.loans
FOR EACH ROW
EXECUTE FUNCTION public.handle_loan_settlement_trigger();


-- 4. Update process_daily_loan_updates idempotent function to check limit restoration
CREATE OR REPLACE FUNCTION public.process_daily_loan_updates() 
RETURNS JSON AS $$
DECLARE
    affected_count INT;
BEGIN
    -- A) Update days overdue for Active/Overdue loans where expected completion is past
    UPDATE public.loans 
    SET days_overdue = EXTRACT(DAY FROM (NOW() - expected_completion_date))::INT
    WHERE status IN ('Active', 'Overdue') AND expected_completion_date < NOW();
    
    -- B) Mark loans as Overdue if days overdue > 0
    UPDATE public.loans 
    SET status = 'Overdue' 
    WHERE status = 'Active' AND days_overdue > 0;

    -- C) Apply penalty (1% of balance) ONLY IF not already done today (Idempotency Guard)
    WITH updated AS (
        UPDATE public.loans
        SET 
            penalties = LEAST(penalties + (balance * 0.01), 3650),
            last_penalty_update = NOW()
        WHERE 
            status = 'Overdue' 
            AND balance > 0
            AND (last_penalty_update IS NULL OR last_penalty_update < CURRENT_DATE)
        RETURNING id
    )
    SELECT COUNT(*) INTO affected_count FROM updated;

    -- D) Update Loan Schedules Status
    UPDATE public.loan_schedules
    SET status = 'overdue', days_overdue = EXTRACT(DAY FROM (NOW() - due_date))::INT
    WHERE status IN ('upcoming', 'due_today', 'partial') AND due_date < NOW()::DATE;

    UPDATE public.loan_schedules
    SET status = 'due_today'
    WHERE status = 'upcoming' AND due_date = NOW()::DATE;

    -- E) Restore credit limits for suspended customers who completed 1-month break without borrowing
    UPDATE public.customers c
    SET credit_limit = ROUND(suspended_baseline_limit * 0.5),
        limit_suspended = FALSE,
        suspended_baseline_limit = NULL,
        last_overdue_clear_date = NULL
    WHERE c.limit_suspended = TRUE
      AND c.last_overdue_clear_date <= NOW() - INTERVAL '30 days'
      AND NOT EXISTS (
          SELECT 1 FROM public.loans l
          WHERE l.customer_id = c.id
            AND l.created_at > c.last_overdue_clear_date
      );

    RETURN json_build_object(
        'success', true,
        'timestamp', NOW(),
        'penalties_applied_to', affected_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure execute privileges are granted
REVOKE EXECUTE ON FUNCTION public.process_daily_loan_updates() FROM public;
REVOKE EXECUTE ON FUNCTION public.process_daily_loan_updates() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_daily_loan_updates() TO service_role;
