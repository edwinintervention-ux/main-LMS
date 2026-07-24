
-- =========================================================================================
-- MIGRATION: Automate Limit Increases (+20% capped at 100k)
-- Date: 2026-07-23
-- 
-- 1. Updates customer_risk_profiles to suggest +20% bounded to 100k instead of +2000
-- 2. Updates handle_loan_settlement_trigger to automatically apply the +20% increase
--    when a customer settles perfectly on time and meets the threshold.
-- =========================================================================================

-- 1. Recreate customer_risk_profiles view with new +20% rule
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
        WHEN COALESCE(lm.settled_loans, 0) < (COALESCE(c.settled_loans_at_limit_increase, 0) + 3)
                                                          THEN 'Maintain (Growth Phase)'
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0
             OR COALESCE(lm.max_overdue_days, 0) > 0     THEN 'Frozen (Arrears Detected)'
        WHEN COALESCE(lm.settled_loans, 0) >= (COALESCE(c.settled_loans_at_limit_increase, 0) + 3)
             AND COALESCE(lm.max_overdue_days, 0) = 0    THEN 'Eligible for +20%'
        ELSE 'Review Required'
    END                                           AS limit_status,

    -- ── Suggested Limit ─────────────────────────────────────────────────────
    -- Only suggest an increase when settled_loans >= (settled_loans_at_limit_increase + 3)
    CASE
        WHEN c.limit_suspended = TRUE THEN 0
        WHEN COALESCE(lm.settled_loans, 0) >= (COALESCE(c.settled_loans_at_limit_increase, 0) + 3)
             AND COALESCE(lm.max_overdue_days, 0) = 0
             AND COALESCE(lm.currently_overdue_count, 0) = 0
             AND c.limit_suspended = FALSE THEN LEAST(ROUND(c.credit_limit * 1.2), 100000)
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


-- 2. Update trigger to automatically apply the +20% increase on perfect settlement
CREATE OR REPLACE FUNCTION public.handle_loan_settlement_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_days_overdue INT;
    v_reduction_pct NUMERIC;
    v_old_limit NUMERIC;
    v_new_limit NUMERIC;
    v_suggested_limit NUMERIC;
    v_limit_status TEXT;
    v_current_limit NUMERIC;
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
            
        -- Settled perfectly on time. Check for automated limit increase.
        ELSE
            -- Query the view to see if this settlement pushes them over the threshold
            SELECT suggested_limit, limit_status, current_limit
            INTO v_suggested_limit, v_limit_status, v_current_limit
            FROM public.customer_risk_profiles
            WHERE customer_id = NEW.customer_id;

            IF v_limit_status = 'Eligible for +20%' AND v_suggested_limit > v_current_limit THEN
                v_new_limit := LEAST(v_suggested_limit, 100000);

                UPDATE public.customers
                SET credit_limit = v_new_limit,
                    last_overdue_clear_date = COALESCE(NEW.settled_at, NOW()),
                    settled_loans_at_limit_increase = COALESCE(settled_loans_at_limit_increase, 0) + 3
                WHERE id = NEW.customer_id;

                INSERT INTO public.audit_logs (user_id, user_label, action, target, detail)
                VALUES (
                    NULL,
                    'system',
                    'LIMIT_INCREASED',
                    NEW.customer_id,
                    'Credit limit automatically increased from ' || v_current_limit || ' to ' || v_new_limit || ' (+20% capped at 100k) due to excellent repayment history. Loan ID: ' || NEW.id
                );
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
