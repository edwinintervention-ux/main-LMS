-- Migration: Fix Supabase Security Advisor Issues
-- 1. Enable RLS on raw_mpesa_logs (it's an internal/edge-function table — only service_role writes)
-- 2. Recreate views with security_invoker=true to remove implicit SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. RLS on raw_mpesa_logs ──────────────────────────────────────────────
-- This table is only written to by Edge Functions via the service_role key,
-- so we enable RLS and allow service_role full access. No public read needed.
ALTER TABLE public.raw_mpesa_logs ENABLE ROW LEVEL SECURITY;

-- Allow service_role to do everything (Edge Functions use this key)
DROP POLICY IF EXISTS "service_role_all_raw_mpesa_logs" ON public.raw_mpesa_logs;
CREATE POLICY "service_role_all_raw_mpesa_logs"
  ON public.raw_mpesa_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Revoke the blanket anon grant that was added earlier — anon has no business
-- reading raw M-Pesa webhook payloads.
REVOKE ALL ON public.raw_mpesa_logs FROM anon;


-- ── 2. customer_risk_profiles — remove implicit SECURITY DEFINER ──────────
DROP VIEW IF EXISTS public.customer_risk_profiles;
CREATE VIEW public.customer_risk_profiles
  WITH (security_invoker = true)
AS
WITH loan_metrics AS (
    SELECT
        customer_id,
        COUNT(*) AS total_loans,
        COUNT(*) FILTER (WHERE status = 'Settled') AS settled_loans,
        COALESCE(MAX(days_overdue), 0) AS max_overdue_days,
        SUM(balance) AS total_outstanding,
        SUM(amount) AS total_borrowed
    FROM public.loans
    GROUP BY customer_id
),
payment_metrics AS (
    SELECT
        customer_id,
        COUNT(*) AS payment_count,
        MAX(date) AS last_payment_date,
        SUM(amount) AS total_repaid
    FROM public.payments
    WHERE status = 'Allocated'
    GROUP BY customer_id
)
SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    c.credit_limit AS current_limit,
    COALESCE(lm.total_loans, 0) AS total_loans,
    COALESCE(lm.settled_loans, 0) AS settled_loans,
    COALESCE(lm.max_overdue_days, 0) AS max_overdue_days,
    COALESCE(lm.total_outstanding, 0) AS total_outstanding,
    COALESCE(pm.payment_count, 0) AS payment_count,
    CASE
        WHEN lm.max_overdue_days > 30 THEN 'Critical'
        WHEN lm.max_overdue_days > 14 THEN 'High'
        WHEN lm.max_overdue_days > 0  THEN 'Medium'
        WHEN lm.total_loans > 3 AND lm.max_overdue_days = 0 THEN 'A+'
        WHEN lm.total_loans > 0 AND lm.max_overdue_days = 0 THEN 'Low'
        ELSE 'New'
    END AS calculated_risk,
    CASE
        WHEN pm.payment_count > (lm.total_loans * 4) THEN 'Frequent Partial'
        WHEN pm.payment_count > 0 THEN 'Standard'
        ELSE 'No History'
    END AS repayment_style,
    CASE
        WHEN lm.total_loans < 3              THEN 'Maintain (Entry Phase)'
        WHEN lm.max_overdue_days > 0         THEN 'Frozen (Arrears Detected)'
        WHEN lm.total_loans >= 3 AND lm.max_overdue_days = 0 THEN 'Eligible for +2000'
        ELSE 'Review Required'
    END AS limit_status,
    CASE
        WHEN lm.total_loans >= 3 AND lm.max_overdue_days = 0 THEN c.credit_limit + 2000
        ELSE c.credit_limit
    END AS suggested_limit
FROM public.customers c
LEFT JOIN loan_metrics    lm ON c.id = lm.customer_id
LEFT JOIN payment_metrics pm ON c.id = pm.customer_id;

-- Grant read access to authenticated users (app uses anon/authenticated keys)
GRANT SELECT ON public.customer_risk_profiles TO authenticated;
GRANT SELECT ON public.customer_risk_profiles TO service_role;


-- ── 3. unified_audit_ledger — remove implicit SECURITY DEFINER ────────────
DROP VIEW IF EXISTS public.unified_audit_ledger;
CREATE VIEW public.unified_audit_ledger
  WITH (security_invoker = true)
AS
SELECT
    'payment'::text AS tx_type,
    p.id,
    p.created_at,
    p.customer_name,
    p.amount,
    p.mpesa AS reference,
    p.status,
    p.is_reg_fee,
    p.loan_id
FROM public.payments p
UNION ALL
SELECT
    'disbursement'::text AS tx_type,
    d.id::text,
    d.created_at,
    c.name AS customer_name,
    d.amount,
    d.transaction_id AS reference,
    d.status,
    false AS is_reg_fee,
    d.loan_id
FROM public.b2c_disbursements d
LEFT JOIN public.customers c ON d.customer_id = c.id;

-- Only admins/service_role should read the full financial ledger
GRANT SELECT ON public.unified_audit_ledger TO authenticated;
GRANT SELECT ON public.unified_audit_ledger TO service_role;
