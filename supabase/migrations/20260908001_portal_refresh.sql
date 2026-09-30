-- Migration: 20260908001_portal_refresh.sql
-- Allow the customer portal to refresh dashboard data after a payment
-- without requiring a new OTP (session is already established).

CREATE OR REPLACE FUNCTION public.get_portal_dashboard(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_suffix  TEXT;
    v_customer RECORD;
    v_loans   JSONB;
    v_payments JSONB;
BEGIN
    -- Normalise: strip non-digits, convert 07XX -> 2547XX, 7XX (9-digit) -> 2547XX
    p_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');
    IF p_phone LIKE '0%' THEN
        p_phone := '254' || SUBSTR(p_phone, 2);
    END IF;
    IF LENGTH(p_phone) = 9 THEN
        p_phone := '254' || p_phone;
    END IF;

    -- Match on last 9 digits to handle any stored prefix variation
    v_suffix := SUBSTR(p_phone, LENGTH(p_phone) - 8);

    SELECT * INTO v_customer
    FROM public.customers
    WHERE phone LIKE '%' || v_suffix
    LIMIT 1;

    IF v_customer.id IS NULL THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(l.*) ORDER BY l.created_at DESC), '[]'::jsonb)
    INTO v_loans
    FROM public.loans l
    WHERE l.customer_id = v_customer.id
      AND l.status NOT IN ('Rejected', 'Declined', 'Cancelled', 'Reversed');

    SELECT COALESCE(jsonb_agg(row_to_json(p.*) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO v_payments
    FROM public.payments p
    WHERE p.customer_id = v_customer.id
      AND p.status = 'Allocated';

    RETURN jsonb_build_object(
        'customer', row_to_json(v_customer.*),
        'loans',    v_loans,
        'payments', v_payments
    );
END;
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_dashboard(TEXT) TO anon;
