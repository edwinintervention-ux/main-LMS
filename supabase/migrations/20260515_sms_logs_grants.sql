-- Migration: Grant access to sms_logs for authenticated users
-- This ensures automated system messages appear in the interactions timeline for admins/workers.

-- 1. Grant SELECT permission
GRANT SELECT ON public.sms_logs TO authenticated;

-- 2. Add RLS Policy
-- Note: authenticated users (admins/workers) should be able to see all logs for monitoring.
DROP POLICY IF EXISTS "Allow authenticated users to read sms_logs" ON public.sms_logs;
CREATE POLICY "Allow authenticated users to read sms_logs" 
ON public.sms_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. Ensure grants are comprehensive (matching project pattern)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sms_logs') THEN
        GRANT ALL ON public.sms_logs TO service_role;
        GRANT SELECT ON public.sms_logs TO authenticated;
        -- Explicitly revoke from anon just in case
        REVOKE ALL ON public.sms_logs FROM anon;
    END IF;
END $$;
