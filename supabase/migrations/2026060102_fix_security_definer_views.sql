-- Migration: Fix Supabase Security Advisor Critical Alerts
-- Drop and recreate views with WITH (security_invoker = true) to enforce RLS and comply with Supabase Security Advisor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. public.unified_audit_ledger
DROP VIEW IF EXISTS public.unified_audit_ledger CASCADE;
CREATE VIEW public.unified_audit_ledger
  WITH (security_invoker = true)
AS
SELECT 
    CASE 
      WHEN p.amount < 0 THEN 'transfer'
      WHEN p.is_reg_fee THEN 'reg_fee'
      WHEN p.notes ILIKE '%transfer%' THEN 'transfer'
      ELSE 'payment'
    END as tx_type,
    p.id,
    p.created_at,
    p.customer_name,
    p.amount,
    p.mpesa as reference,
    p.status,
    p.is_reg_fee,
    p.loan_id,
    p.notes,
    p.reversal_id
FROM public.payments p
UNION ALL
SELECT 
    'disbursement' as tx_type,
    d.id::text,
    d.created_at,
    c.name as customer_name,
    d.amount,
    d.transaction_id as reference,
    d.status,
    false as is_reg_fee,
    d.loan_id,
    d.result_desc as notes,
    d.reversal_id
FROM public.b2c_disbursements d
LEFT JOIN public.customers c ON d.customer_id = c.id;

GRANT SELECT ON public.unified_audit_ledger TO authenticated;
GRANT SELECT ON public.unified_audit_ledger TO service_role;


-- 2. public.reporting_loans
DROP VIEW IF EXISTS public.reporting_loans CASCADE;
CREATE VIEW public.reporting_loans
  WITH (security_invoker = true)
AS
SELECT 
    l.id AS loan_id,
    l.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.location AS customer_location,
    l.amount AS loan_amount,
    l.balance AS outstanding_balance,
    (l.amount - l.balance) AS amount_repaid,
    l.status AS loan_status,
    l.disbursed AS disbursed_date,
    l.expected_completion_date,
    l.repayment_type,
    l.officer AS loan_officer,
    l.collections_officer,
    l.days_overdue,
    l.created_at AS loan_created_at
FROM public.loans l
LEFT JOIN public.customers c ON l.customer_id = c.id;

GRANT SELECT ON public.reporting_loans TO reporting_role;


-- 3. public.reporting_payments
DROP VIEW IF EXISTS public.reporting_payments CASCADE;
CREATE VIEW public.reporting_payments
  WITH (security_invoker = true)
AS
SELECT 
    p.id AS payment_id,
    p.loan_id,
    p.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    p.amount AS paid_amount,
    p.status AS payment_status,
    p.date AS payment_date,
    p.mpesa AS mpesa_code
FROM public.payments p
LEFT JOIN public.customers c ON p.customer_id = c.id;

GRANT SELECT ON public.reporting_payments TO reporting_role;


-- 4. public.reporting_performance_summary
DROP VIEW IF EXISTS public.reporting_performance_summary CASCADE;
CREATE VIEW public.reporting_performance_summary
  WITH (security_invoker = true)
AS
SELECT 
    COALESCE(d.date, c.date) AS date,
    COALESCE(d.disbursed_amount, 0) AS total_disbursed,
    COALESCE(c.collected_amount, 0) AS total_collected
FROM (
    SELECT 
        disbursed::date AS date,
        SUM(amount) AS disbursed_amount
    FROM public.loans
    WHERE status != 'Cancelled'
    GROUP BY disbursed::date
) d
FULL OUTER JOIN (
    SELECT 
        date::date AS date,
        SUM(amount) AS collected_amount
    FROM public.payments
    WHERE status = 'Allocated'
    GROUP BY date::date
) c ON d.date = c.date;

GRANT SELECT ON public.reporting_performance_summary TO reporting_role;

NOTIFY pgrst, 'reload schema';
