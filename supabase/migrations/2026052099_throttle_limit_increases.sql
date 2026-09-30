-- Migration: Throttle Credit Limit Increases
-- Only suggest a new limit increase after 3 settled loans since the last increase
-- Created: 2026-05-20
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add tracking column to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS settled_loans_at_limit_increase INT DEFAULT 0;

-- 2. Recreate customer_risk_profiles view with throttled scaling logic
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
             AND COALESCE(lm.max_overdue_days, 0) = 0    THEN 'Eligible for +2000'
        ELSE 'Review Required'
    END                                           AS limit_status,

    -- ── Suggested Limit ─────────────────────────────────────────────────────
    -- Only suggest an increase when settled_loans >= (settled_loans_at_limit_increase + 3)
    CASE
        WHEN c.limit_suspended = TRUE THEN 0
        WHEN COALESCE(lm.settled_loans, 0) >= (COALESCE(c.settled_loans_at_limit_increase, 0) + 3)
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
