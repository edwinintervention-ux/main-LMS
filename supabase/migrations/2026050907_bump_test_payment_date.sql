-- ================================================================
-- MIGRATION: Bump Test Payment Date for Visibility (v2)
-- Target: PAY-8323838C
-- ================================================================

UPDATE public.payments 
   SET date = NOW()
 WHERE id = 'PAY-8323838C';
