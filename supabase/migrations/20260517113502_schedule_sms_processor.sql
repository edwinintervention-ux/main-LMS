-- ================================================================
-- MIGRATION: Schedule SMS Processor Cron Job
-- Goal: Schedule the process-queued-sms Edge Function to run hourly
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the SMS processing edge function to run hourly on the hour
SELECT cron.schedule(
    'process-queued-sms-hourly',
    '0 * * * *',
    $$
    SELECT net.http_post(
        url:='https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/process-queued-sms',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{}'::jsonb
    );
    $$
);
