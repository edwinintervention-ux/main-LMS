-- ================================================================
-- MIGRATION: Decommission Automated Reminders
-- Focus: Unscheduling the pg_cron jobs for reminders.
-- ================================================================

-- 1. Unschedule Morning Reminders
SELECT cron.unschedule('automated-reminders-morning');

-- 2. Unschedule Evening Reminders
SELECT cron.unschedule('automated-reminders-evening');

-- Note: We leave 'daily-loan-updates' active as it handles 
-- interest/penalty calculations which are critical for financials.
