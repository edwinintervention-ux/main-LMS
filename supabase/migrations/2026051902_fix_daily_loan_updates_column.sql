-- Migration: Fix Daily Loan Updates Column and Schedules
-- Created: 2026-05-19
-- Focus: Add expected_completion_date column and create loan_schedules table to prevent daily updates crash.

-- 1. Add expected_completion_date column to loans table if missing
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS expected_completion_date DATE;

-- 2. Create loan_schedules table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.loan_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id TEXT REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
    customer_id TEXT REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date DATE NOT NULL,
    amount_due NUMERIC NOT NULL,
    amount_paid NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due_today', 'overdue', 'paid', 'paid_late', 'partial')),
    paid_date TIMESTAMPTZ,
    days_overdue INTEGER DEFAULT 0,
    penalty_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add basic select/all policies for loan_schedules
ALTER TABLE public.loan_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View Loan Schedules" ON public.loan_schedules;
CREATE POLICY "View Loan Schedules" ON public.loan_schedules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin Update Loan Schedules" ON public.loan_schedules;
CREATE POLICY "Admin Update Loan Schedules" ON public.loan_schedules FOR ALL USING (true);

-- 3. Set up triggers on loans to automatically compute expected_completion_date
CREATE OR REPLACE FUNCTION public.calc_expected_completion_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.disbursed IS NOT NULL AND NEW.expected_completion_date IS NULL THEN
        NEW.expected_completion_date := (NEW.disbursed + INTERVAL '30 days')::DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loans_calc_completion ON public.loans;
CREATE TRIGGER trg_loans_calc_completion
BEFORE INSERT OR UPDATE OF disbursed, expected_completion_date ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.calc_expected_completion_date();

-- 4. Update existing loans to compute expected_completion_date
UPDATE public.loans 
SET expected_completion_date = (disbursed + INTERVAL '30 days')::DATE 
WHERE disbursed IS NOT NULL AND expected_completion_date IS NULL;
