-- ================================================================
-- MIGRATION: Prevent Duplicate Payments
-- Adds a unique constraint to the mpesa receipt column.
-- ================================================================

-- 1. Add Unique Constraint to payments.mpesa
-- We use a partial index to allow multiple NULLs but only one of each receipt ID.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mpesa_unique ON public.payments (mpesa) WHERE (mpesa IS NOT NULL AND mpesa != '');

-- 2. Optional: Add a constraint to registration_fees as well if needed
-- (Already handled by logic usually, but good for safety)
-- ALTER TABLE public.registration_fees ADD CONSTRAINT registration_fees_customer_id_key UNIQUE (customer_id);
-- Wait, a customer might pay registration fee twice if it expires? Usually not.

-- 3. Update Audit Trail for safety
COMMENT ON INDEX idx_payments_mpesa_unique IS 'Prevents duplicate M-Pesa receipt recording across all callback sources.';
