-- Migration: Add UNIQUE constraint to payments.mpesa
-- Date: 2026-09-30
-- Reason: The daraja-c2b-callback edge function uses .upsert({ onConflict: 'mpesa' })
-- but without a UNIQUE constraint on the column, PostgreSQL rejects the upsert silently.
-- This caused incoming M-Pesa C2B payments to be silently dropped while still marking
-- the customer as mpesa_registered = true, leading to missing payment records.

-- Step 1: Clean up any empty-string mpesa values (treat them as NULL)
UPDATE payments SET mpesa = NULL WHERE mpesa = '';

-- Step 2: Add UNIQUE constraint (NULLs are not considered duplicates in PostgreSQL,
-- so manual/cash payments with no mpesa code are unaffected)
ALTER TABLE payments
    ADD CONSTRAINT payments_mpesa_unique UNIQUE (mpesa);
