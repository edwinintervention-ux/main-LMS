-- ================================================================
-- MIGRATION: Add missing tables and columns not in base schema v4
-- ================================================================

-- 1. STK Requests table (M-Pesa STK Push tracking)
CREATE TABLE IF NOT EXISTS public.stk_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    merchant_request_id text,
    checkout_request_id text UNIQUE NOT NULL,
    phone_number text NOT NULL,
    amount numeric(12,2) NOT NULL,
    reference text,
    description text,
    status text DEFAULT 'Pending',
    result_code integer,
    result_desc text,
    mpesa_receipt text,
    loan_id text,
    transaction_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.stk_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can view stk_requests" ON public.stk_requests;
CREATE POLICY "Authenticated can view stk_requests" ON public.stk_requests
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages stk_requests" ON public.stk_requests;
CREATE POLICY "Service role manages stk_requests" ON public.stk_requests
    FOR ALL TO service_role USING (true);

-- 2. B2C Disbursements table (M-Pesa B2C tracking)
CREATE TABLE IF NOT EXISTS public.b2c_disbursements (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    loan_id text,
    phone_number text,
    amount numeric,
    status text DEFAULT 'Pending',
    conversation_id text,
    originator_conversation_id text,
    receipt text,
    result_code integer,
    result_desc text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.b2c_disbursements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.b2c_disbursements;
CREATE POLICY "Enable read access for all authenticated users" ON public.b2c_disbursements
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Service role manages b2c_disbursements" ON public.b2c_disbursements;
CREATE POLICY "Service role manages b2c_disbursements" ON public.b2c_disbursements
    FOR ALL TO service_role USING (true);

-- 3. Add device/geo columns to audit_log
ALTER TABLE public.audit_log
    ADD COLUMN IF NOT EXISTS device_type TEXT,
    ADD COLUMN IF NOT EXISTS browser     TEXT,
    ADD COLUMN IF NOT EXISTS os          TEXT,
    ADD COLUMN IF NOT EXISTS ip_address  TEXT,
    ADD COLUMN IF NOT EXISTS country     TEXT,
    ADD COLUMN IF NOT EXISTS city        TEXT,
    ADD COLUMN IF NOT EXISTS session_id  TEXT;

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_stk_requests_checkout ON public.stk_requests(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_stk_requests_status   ON public.stk_requests(status);
CREATE INDEX IF NOT EXISTS idx_b2c_loan_id           ON public.b2c_disbursements(loan_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_browser      ON public.audit_log(browser);
CREATE INDEX IF NOT EXISTS idx_audit_log_session      ON public.audit_log(session_id);

-- 5. Grant access
GRANT SELECT ON public.stk_requests TO authenticated;
GRANT SELECT ON public.b2c_disbursements TO authenticated;
