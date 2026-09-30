UPDATE public.loans
   SET balance = 0, status = 'Settled', updated_at = NOW()
 WHERE customer_name ILIKE 'Test Customer'
   AND status NOT IN ('Settled', 'Written off', 'Rejected');
