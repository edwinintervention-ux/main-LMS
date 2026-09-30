-- ================================================================
-- MIGRATION: Settle All Active Test Customer Loans
-- Purpose   : Reset test data — zero out balances and mark Settled
--             so the test customer can be reused for fresh tests.
-- ================================================================

-- 1. Settle all non-settled loans belonging to "Test Customer"
UPDATE public.loans
   SET balance    = 0,
       status     = 'Settled',
       updated_at = NOW()
 WHERE customer_name ILIKE 'Test Customer'
   AND status NOT IN ('Settled', 'Written off', 'Rejected');

-- 2. Confirm what was updated (informational — safe to ignore in migrations)
DO $$
DECLARE
  settled_count INT;
BEGIN
  SELECT COUNT(*) INTO settled_count
    FROM public.loans
   WHERE customer_name ILIKE 'Test Customer'
     AND status = 'Settled';

  RAISE NOTICE 'Test Customer: % loan(s) now in Settled status.', settled_count;
END;
$$;
