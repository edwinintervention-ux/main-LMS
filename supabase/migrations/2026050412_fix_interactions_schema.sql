-- Add missing columns to interactions table to match app expectations
-- This fixes the 400 Bad Request error when saving customer interactions

ALTER TABLE public.interactions 
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.interactions 
ADD COLUMN IF NOT EXISTS promise_date date;

ALTER TABLE public.interactions 
ADD COLUMN IF NOT EXISTS promise_status text;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
