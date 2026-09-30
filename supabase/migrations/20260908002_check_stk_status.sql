-- Migration: 20260908002_check_stk_status.sql
-- Allows the customer portal (anon role) to poll the status
-- of an STK push request by its checkout_request_id.

CREATE OR REPLACE FUNCTION public.check_stk_status(p_checkout_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_result_desc TEXT;
BEGIN
    SELECT status, result_desc
    INTO v_status, v_result_desc
    FROM public.stk_requests
    WHERE checkout_request_id = p_checkout_id
    LIMIT 1;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('status', 'NotFound');
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'result_desc', COALESCE(v_result_desc, '')
    );
END;
$$;

-- Grant execute to both anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.check_stk_status(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_stk_status(TEXT) TO authenticated;
