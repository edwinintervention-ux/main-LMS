-- ================================================================
-- MIGRATION: Schedule Daily Reminder Generation Cron Job
--
-- Calls queue_scheduled_reminders() every morning at 06:00 AM EAT
-- (03:00 UTC) so Daily loan missed-payment reminders and all other
-- reminder types are reliably generated each day.
-- ================================================================

-- Remove any pre-existing job with the same name
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-scheduled-reminders-daily') THEN
    PERFORM cron.unschedule('queue-scheduled-reminders-daily');
  END IF;
END $$;

-- Schedule: every day at 03:00 UTC = 06:00 AM East Africa Time
SELECT cron.schedule(
  'queue-scheduled-reminders-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/fix-db-logic',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify all scheduled jobs
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;