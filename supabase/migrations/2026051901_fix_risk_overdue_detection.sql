-- Migration: Fix risk profile — detect currently-overdue loans via status column
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG: The previous view computed max_overdue_days using MAX(days_overdue)
-- from the loans table. That column can be stale (value = 0) even when a loan
-- is actively in 'Overdue' status, because the app computes overdue state
-- dynamically (via calculateLoanStatus) and may not always write it back.
--
-- FIX: Add currently_overdue_count which counts loans with status = 'Overdue'
-- directly. Use GREATEST() to ensure max_overdue_days is at least 1 whenever
-- any loan is in Overdue status. All downstream CASE expressions (calculated_risk,
-- limit_status, suggested_limit) now check both fields.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.customer_risk_profiles;

CREATE VIEW public.customer_risk_profiles
  WITH (security_invoker = true)
AS
WITH loan_metrics AS (
    SELECT
        customer_id,
        COUNT(*)                                          AS total_loans,
        COUNT(*) FILTER (WHERE status = 'Settled')        AS settled_loans,
        -- Live overdue count: trust the status column, not just the stored int
        COUNT(*) FILTER (WHERE status = 'Overdue')        AS currently_overdue_count,
        -- GREATEST ensures that an 'Overdue' loan with a stale days_overdue = 0
        -- still registers as overdue (minimum 1 day exposure).
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
    c.credit_limit                                AS current_limit,
    COALESCE(lm.total_loans, 0)                   AS total_loans,
    COALESCE(lm.settled_loans, 0)                 AS settled_loans,
    COALESCE(lm.currently_overdue_count, 0)       AS currently_overdue_count,
    COALESCE(lm.max_overdue_days, 0)              AS max_overdue_days,
    COALESCE(lm.total_outstanding, 0)             AS total_outstanding,
    COALESCE(pm.payment_count, 0)                 AS payment_count,

    -- ── Risk Rating ────────────────────────────────────────────────────────
    -- Checks status='Overdue' count first (catches stale days_overdue = 0),
    -- then falls back to historical max for graduated severity.
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
    END AS calculated_risk,

    -- ── Repayment Style ─────────────────────────────────────────────────────
    CASE
        WHEN pm.payment_count > (lm.total_loans * 4) THEN 'Frequent Partial'
        WHEN pm.payment_count > 0                     THEN 'Standard'
        ELSE 'No History'
    END AS repayment_style,

    -- ── Limit Status ────────────────────────────────────────────────────────
    CASE
        WHEN COALESCE(lm.total_loans, 0) < 3                          THEN 'Maintain (Entry Phase)'
        WHEN COALESCE(lm.currently_overdue_count, 0) > 0
             OR COALESCE(lm.max_overdue_days, 0) > 0                  THEN 'Frozen (Arrears Detected)'
        WHEN COALESCE(lm.total_loans, 0) >= 3
             AND COALESCE(lm.max_overdue_days, 0) = 0                 THEN 'Eligible for +2000'
        ELSE 'Review Required'
    END AS limit_status,

    -- ── Suggested Limit ─────────────────────────────────────────────────────
    -- Only eligible if: 3+ loans, zero historical overdue days, zero current overdue
    CASE
        WHEN COALESCE(lm.total_loans, 0) >= 3
             AND COALESCE(lm.max_overdue_days, 0) = 0
             AND COALESCE(lm.currently_overdue_count, 0) = 0 THEN c.credit_limit + 2000
        ELSE c.credit_limit
    END AS suggested_limit

FROM public.customers c
LEFT JOIN loan_metrics    lm ON c.id = lm.customer_id
LEFT JOIN payment_metrics pm ON c.id = pm.customer_id;

-- Re-grant access (same as before)
GRANT SELECT ON public.customer_risk_profiles TO authenticated;
GRANT SELECT ON public.customer_risk_profiles TO service_role;
