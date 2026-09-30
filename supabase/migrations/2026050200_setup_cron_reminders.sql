
-- ================================================================
-- MIGRATION: Setup Cron Schedules for Automated Tasks
-- Focus: Ensuring reminders and daily updates run automatically.
-- ================================================================

-- Enable necessary extensions (safe to run if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Schedule Morning Reminders (7 AM EAT = 4 AM UTC)
-- We use pg_net to call the Edge Function.
-- Using 'test_hour' in the body to ensure the logic picks the right window.
SELECT cron.schedule(
    'automated-reminders-morning',
    '0 4 * * *',
    $$
    SELECT net.http_post(
        url:='https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/automated-reminders',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{"test_hour": 7}'::jsonb
    );
    $$
);

-- 2. Schedule Evening Reminders (7 PM EAT = 4 PM UTC)
SELECT cron.schedule(
    'automated-reminders-evening',
    '0 16 * * *',
    $$
    SELECT net.http_post(
        url:='https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/automated-reminders',
        headers:='{"Content-Type": "application/json"}'::jsonb,
        body:='{"test_hour": 19}'::jsonb
    );
    $$
);

-- 3. Schedule Daily Loan Updates (Midnight UTC / 3 AM EAT)
-- This updates penalties, days overdue, and loan statuses.
SELECT cron.schedule(
    'daily-loan-updates',
    '0 0 * * *',
    $$
    SELECT public.process_daily_loan_updates();
    $$
);

-- Grant permissions to see the cron logs (helpful for debugging)
GRANT USAGE ON SCHEMA cron TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO service_role;
