-- Migration: Create Looker Studio Reporting Role, User, and Optimized Views
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Create a secure read-only role and login user if they do not exist
DO $$
BEGIN
    -- Create the reporting role if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'reporting_role') THEN
        CREATE ROLE reporting_role;
    END IF;

    -- Create the login user if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'looker_studio_reporting') THEN
        CREATE ROLE looker_studio_reporting WITH LOGIN PASSWORD 'AdequateReport2026!';
        GRANT reporting_role TO looker_studio_reporting;
    END IF;
END
$$;

-- 2. Grant permissions to the reporting role
GRANT USAGE ON SCHEMA public TO reporting_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reporting_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO reporting_role;

-- Ensure future tables added to public schema are also readable
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO reporting_role;


-- 3. Create Custom Reporting Views for Looker Studio
-- ─────────────────────────────────────────────────────────────────────────────

-- View A: Unified Loans Reporting
DROP VIEW IF EXISTS public.reporting_loans;
CREATE VIEW public.reporting_loans AS
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

-- View B: Unified Payments & Collections Reporting
DROP VIEW IF EXISTS public.reporting_payments;
CREATE VIEW public.reporting_payments AS
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

-- View C: Daily Performance Summaries (Collections vs Disbursements)
DROP VIEW IF EXISTS public.reporting_performance_summary;
CREATE VIEW public.reporting_performance_summary AS
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


-- 4. Grant explicit read permission on the reporting views
GRANT SELECT ON public.reporting_loans TO reporting_role;
GRANT SELECT ON public.reporting_payments TO reporting_role;
GRANT SELECT ON public.reporting_performance_summary TO reporting_role;
