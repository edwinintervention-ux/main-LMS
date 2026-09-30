-- MIGRATION: Fix Cron Schedules for Penalties and Reminders
-- Fixes a race condition where the SMS queue script was running slightly before
-- the daily penalty script, causing the SMS texts to send with the previous day's balance.

-- 1. Remove old crons
SELECT cron.unschedule('queue-scheduled-reminders');
SELECT cron.unschedule('queue-scheduled-reminders-daily');
SELECT cron.unschedule('queue-loan-reminders-daily');
SELECT cron.unschedule('apply-daily-penalties');
SELECT cron.unschedule('daily-loan-updates');
SELECT cron.unschedule('calculate_penalties');

-- 2. Schedule apply_daily_penalties at 00:01 EAT (21:01 UTC)
SELECT cron.schedule(
    'apply-daily-penalties',
    '1 21 * * *',
    $$ SELECT public.apply_daily_penalties(); $$
);

-- 3. Schedule queue_scheduled_reminders at 00:15 EAT (21:15 UTC)
-- This gives apply_daily_penalties 14 minutes to finish updating balances
SELECT cron.schedule(
    'queue-scheduled-reminders-daily',
    '15 21 * * *',
    $$ SELECT public.queue_scheduled_reminders(); $$
);
