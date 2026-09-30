-- One-time cleanup: purge orphaned child records for the two deleted customers
-- CUS-IIF9GWW (Catherine Akinyi Hongo) and CUS-80B3743 (Josephine Ndunge Makau)
-- Their customer rows are already gone but child records may remain and ghost in reports.

DO $$
DECLARE
  v_ids TEXT[] := ARRAY['CUS-IIF9GWW', 'CUS-80B3743'];
  v_tables TEXT[] := ARRAY['queued_sms', 'registration_fees', 'stk_requests', 'interactions', 'payments', 'loans'];
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DELETE FROM public.%I WHERE customer_id = ANY($1)', v_table) USING v_ids;
    RAISE NOTICE 'Cleaned %', v_table;
  END LOOP;
END;
$$;
