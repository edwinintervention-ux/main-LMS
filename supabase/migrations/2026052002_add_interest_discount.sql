-- Migration: Add interest_discount column to public.customers and public.loans tables
-- This adds support for percentage-based interest rate discounts on future loans.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS interest_discount NUMERIC DEFAULT 0
  CHECK (interest_discount >= 0 AND interest_discount <= 100);

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS interest_discount NUMERIC DEFAULT 0
  CHECK (interest_discount >= 0 AND interest_discount <= 100);

COMMENT ON COLUMN public.customers.interest_discount IS 'Optional admin-configured interest rate discount (0 to 100). Default 0 = standard 30% rate.';
COMMENT ON COLUMN public.loans.interest_discount IS 'Frozen interest rate discount (0 to 100) at the time of loan creation.';
