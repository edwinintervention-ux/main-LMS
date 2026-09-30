
-- ================================================================
-- MIGRATION: Remove Auto-Allocation on Loan Creation
-- Focus: Reverts the auto-allocation trigger while keeping other hardening measures.
-- ================================================================

-- 1. Remove the trigger and function that automatically allocates funds on loan creation.
-- The user prefers that unallocated payments are handled manually via the dashboard.
DROP TRIGGER IF EXISTS trg_allocate_on_loan_creation ON public.loans;
DROP FUNCTION IF EXISTS public.allocate_pending_payments_to_new_loan();

-- 2. NOTE: We are KEEPING the 'idx_one_active_loan_per_customer' index 
-- and the 'trg_apply_payment' (INSERT OR UPDATE) improvements, 
-- as they ensure data integrity and make manual allocation more reliable.
