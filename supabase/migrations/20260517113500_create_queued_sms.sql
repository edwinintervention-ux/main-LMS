-- ================================================================
-- MIGRATION: Create Queued SMS Table
-- Goal: Create a queue table for automated SMS reminders.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.queued_sms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id TEXT NOT NULL,
    loan_id TEXT,
    message TEXT NOT NULL,
    send_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'cancelled', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.queued_sms ENABLE ROW LEVEL SECURITY;

-- Block anon
REVOKE ALL ON public.queued_sms FROM anon;

-- Explicit GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.queued_sms TO authenticated;
GRANT ALL ON public.queued_sms TO service_role;

-- Allow authenticated users to view all queued SMS
CREATE POLICY "Enable read access for all authenticated users" ON public.queued_sms
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert
CREATE POLICY "Enable insert for authenticated users" ON public.queued_sms
    FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update
CREATE POLICY "Enable update for authenticated users" ON public.queued_sms
    FOR UPDATE TO authenticated USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION set_updated_at_queued_sms()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_queued_sms_updated_at ON public.queued_sms;
CREATE TRIGGER trg_queued_sms_updated_at
BEFORE UPDATE ON public.queued_sms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_queued_sms();
