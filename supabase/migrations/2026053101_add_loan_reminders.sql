-- ================================================================
-- MIGRATION: Add Loan SMS Reminders Queue and Cron Jobs
-- ================================================================

CREATE TABLE IF NOT EXISTS loan_reminders_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID REFERENCES loans(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (loan_id, reminder_type)
);

-- Queue messages daily at 2:00 AM
SELECT cron.schedule(
    'queue-loan-reminders-daily',
    '0 2 * * *',
    $$
    SELECT net.http_post(
        url        := 'https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/queue-loan-reminders',
        headers    := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI"}'::jsonb,
        body       := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Send queued messages daily at 7:00 AM
SELECT cron.schedule(
    'send-loan-reminders-daily',
    '0 7 * * *',
    $$
    SELECT net.http_post(
        url        := 'https://wnmabkrkbcigxqdprzrb.supabase.co/functions/v1/send-loan-reminders',
        headers    := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndubWFia3JrYmNpZ3hxZHByenJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1ODI2NywiZXhwIjoyMDkyNTM0MjY3fQ.L8TnRTzQ5HZRGdBPtSrtSIufC3SLtcqRE8n89roTLxI"}'::jsonb,
        body       := '{}'::jsonb
    ) AS request_id;
    $$
);
