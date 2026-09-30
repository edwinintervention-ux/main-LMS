-- Migration: Fix sms_logs and queued_sms INSERT permissions for authenticated users
-- This resolves "new row violates row-level security policy for table sms_logs"
-- when admin users send messages directly from the Queued Messages tab.

-- 1. Grant INSERT + SELECT on sms_logs to authenticated users
GRANT INSERT, SELECT ON public.sms_logs TO authenticated;

-- 2. Create RLS INSERT policy for authenticated users on sms_logs
DROP POLICY IF EXISTS "Allow authenticated users to insert sms_logs" ON public.sms_logs;
CREATE POLICY "Allow authenticated users to insert sms_logs"
ON public.sms_logs
FOR INSERT TO authenticated
WITH CHECK (true);

-- 3. Grant INSERT + UPDATE + SELECT on queued_sms to authenticated users
--    (needed for manually queuing messages from the UI)
GRANT INSERT, UPDATE, SELECT ON public.queued_sms TO authenticated;

-- Ensure service_role retains full access (idempotent)
GRANT ALL ON public.sms_logs TO service_role;
GRANT ALL ON public.queued_sms TO service_role;
