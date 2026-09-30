-- Add helb_amount column to workers table for HELB loan deduction tracking
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS helb_amount numeric DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
