-- Migration: Add optional HELB deduction to workers
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a nullable `helb_amount` integer column to the workers table.
-- When set (non-null), this monthly amount is deducted from the worker's 
-- payslip as a named "HELB Loan Repayment" line item in the Statutory section.
-- Admins/Superadmins can toggle this per-employee from the Salaries tab.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS helb_amount INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.workers.helb_amount IS 
  'Monthly HELB loan repayment deduction (KES). NULL means no HELB enrolled.';
