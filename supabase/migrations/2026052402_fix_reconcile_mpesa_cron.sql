-- ================================================================
-- MIGRATION: Fix Reconcile Mpesa Cron - Proper Authorization Header
-- 
-- ROOT CAUSE CONFIRMED:
--   The cron job 'reconcile-mpesa-every-15-mins' was invoking the edge
--   function with:
--     Authorization: Bearer || current_setting('app.settings.service_role_key', true)
--   However, app.settings.service_role_key is null/unset in the database
--   settings, causing the auth header value to be empty and breaking the
--   JSON syntax structure of the HTTP headers, which caused the cron job
--   to consistently fail.
--
-- FIX:
--   1. Unschedule the broken cron job.
--   2. Re-schedule it with the correct Authorization header embedded
--      containing the service role key.
-- ================================================================

-- Step 1: Remove the broken job
SELECT cron.unschedule('reconcile-mpesa-every-15-mins');

-- Step 2: Re-create with Authorization header
SELECT cron.schedule(
    'reconcile-mpesa-every-15-mins',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
        url        := 'https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/reconcile-mpesa',
        headers    := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI"}'::jsonb,
        body       := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Verify the jobs are registered correctly
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
