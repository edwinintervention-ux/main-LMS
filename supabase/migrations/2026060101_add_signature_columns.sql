-- Migration to add signature columns
drop table if exists public.loans cascade; -- placeholder, do not drop table, just alter

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS borrower_signature TEXT,
  ADD COLUMN IF NOT EXISTS officer_signature TEXT;
