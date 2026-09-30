-- Migration: Add penalty_waived column to public.loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS penalty_waived NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.loans.penalty_waived IS 'Accumulated penalty amount that has been manually waived by the admin on merit.';
