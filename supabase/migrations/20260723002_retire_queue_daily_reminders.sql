-- ================================================================
-- MIGRATION: Retire queue_daily_reminders (2026-07-23)
--
-- The queue_daily_reminders() function triggered a "fallen behind"
-- SMS after exactly 3 days without a payment. Replaced by the
-- more accurate Daily Payment Schedule reminder logic inside
-- queue_scheduled_reminders(), which compares total paid vs
-- expected cumulative payment (fires on day 3, 6, 9...).
-- ================================================================

-- 1. Remove cron job (ignore if already removed)
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-daily-reminders') THEN
    PERFORM cron.unschedule('queue-daily-reminders');
  END IF;
END $guard$;

-- 2. Replace function with a no-op stub
CREATE OR REPLACE FUNCTION public.queue_daily_reminders()
RETURNS void
LANGUAGE sql
AS $$
$$;