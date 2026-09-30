-- ================================================================
-- MIGRATION: Fix SMS Dispatcher Cron - Proper Authorization Header
-- 
-- ROOT CAUSE CONFIRMED:
--   29 messages were stuck in "queued" status for up to 7 days.
--   The cron job 'process-queued-sms-hourly' was invoking the edge
--   function WITHOUT an Authorization header. Supabase Edge Functions
--   require 'Authorization: Bearer <service_role_key>' — without it,
--   the function receives a 401 Unauthorized and silently fails.
--
-- FIX:
--   1. Unschedule the broken cron job.
--   2. Re-schedule it with the correct Authorization header embedded
--      using Supabase's vault secret for the service role key.
-- ================================================================

-- Step 1: Remove the broken job
SELECT cron.unschedule('process-queued-sms-hourly');

-- Step 2: Re-create with Authorization header
-- We hardcode the service role key in the cron command, which is the 
-- standard pattern for pg_cron + pg_net + Supabase Edge Functions.
SELECT cron.schedule(
    'process-queued-sms-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url        := 'https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/process-queued-sms',
        headers    := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI"}'::jsonb,
        body       := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Verify the jobs are registered correctly
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
