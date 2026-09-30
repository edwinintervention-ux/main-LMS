-- ============================================================
-- Migration: Explicit Data API Grants (Supabase May 2026 Policy)
-- From October 30, 2026, Supabase enforces this on all projects.
-- Uses conditional grants to handle tables that may not exist.
-- ============================================================

-- Helper: grant to a role only if the table/view actually exists
CREATE OR REPLACE FUNCTION pg_temp.grant_if_exists(
  p_privs TEXT,
  p_obj   TEXT,
  p_role  TEXT
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = p_obj
    UNION ALL
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = p_obj
  ) THEN
    EXECUTE format('GRANT %s ON public.%I TO %I', p_privs, p_obj, p_role);
  END IF;
END $$;

-- ── authenticated role ────────────────────────────────────────────
-- Core business tables
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'customers',           'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'loans',               'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'payments',            'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'leads',               'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'interactions',        'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT',         'audit_log',           'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'registration_fees',   'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'loan_schedules',      'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'manual_transactions', 'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'workers',             'authenticated');

-- M-Pesa / payment tables
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'b2c_disbursements',   'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'stk_requests',        'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'unallocated_payments','authenticated');
SELECT pg_temp.grant_if_exists('SELECT',                 'mpesa_disbursements', 'authenticated');
SELECT pg_temp.grant_if_exists('SELECT',                 'mpesa_collections',   'authenticated');
SELECT pg_temp.grant_if_exists('SELECT',                 'mpesa_transactions',  'authenticated');

-- HR / Payroll tables
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'salary_payments',     'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'monthly_targets',     'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'worker_deductions',   'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'payslips',            'authenticated');
SELECT pg_temp.grant_if_exists('SELECT, INSERT, UPDATE', 'repossessed_assets',  'authenticated');

-- Views
SELECT pg_temp.grant_if_exists('SELECT', 'customer_risk_profiles', 'authenticated');
SELECT pg_temp.grant_if_exists('SELECT', 'unified_audit_ledger',   'authenticated');
SELECT pg_temp.grant_if_exists('SELECT', 'safe_customers',         'authenticated');
SELECT pg_temp.grant_if_exists('SELECT', 'financial_summary',      'authenticated');

-- ── service_role ─────────────────────────────────────────────────
-- Full access for Edge Functions and the Node server
SELECT pg_temp.grant_if_exists('ALL', 'customers',           'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'loans',               'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'payments',            'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'leads',               'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'interactions',        'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'audit_log',           'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'registration_fees',   'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'loan_schedules',      'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'manual_transactions', 'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'workers',             'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'b2c_disbursements',   'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'stk_requests',        'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'unallocated_payments','service_role');
SELECT pg_temp.grant_if_exists('ALL', 'mpesa_disbursements', 'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'mpesa_collections',   'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'mpesa_transactions',  'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'salary_payments',     'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'monthly_targets',     'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'worker_deductions',   'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'payslips',            'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'repossessed_assets',  'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'sms_logs',            'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'processed_requests',  'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'raw_mpesa_logs',      'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'customer_risk_profiles', 'service_role');
SELECT pg_temp.grant_if_exists('ALL', 'unified_audit_ledger',   'service_role');

-- ── anon: block everything ────────────────────────────────────────
-- This app is admin/worker only — anon has no business accessing data.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
