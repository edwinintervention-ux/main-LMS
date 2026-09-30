-- MIGRATION: Customer Portal OTP
-- 1. Create table
CREATE TABLE IF NOT EXISTS public.otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON public.otp_codes (phone);

-- Secure it (only postgres/service_role can read/write directly)
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- 2. Function to generate OTP (2 mins expiry)
CREATE OR REPLACE FUNCTION public.request_customer_otp(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_exists BOOLEAN;
    v_code TEXT;
BEGIN
    -- Normalize phone to match how they might be stored
    v_clean_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');
    IF v_clean_phone LIKE '0%' THEN
        v_clean_phone := '254' || SUBSTR(v_clean_phone, 2);
    END IF;

    -- Check if customer exists (checking clean phone against stored phone)
    -- Using a loose LIKE to match possible formats
    SELECT EXISTS (
        SELECT 1 FROM public.customers 
        WHERE phone LIKE '%' || SUBSTR(v_clean_phone, 4)
           OR phone = p_phone
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;

    -- Invalidate existing unused codes for this phone
    UPDATE public.otp_codes SET used = TRUE WHERE phone = v_clean_phone AND used = FALSE;

    -- Generate 4-digit code
    v_code := lpad(floor(random() * 10000)::text, 4, '0');

    -- Insert with 2 minute expiry
    INSERT INTO public.otp_codes (phone, code, expires_at)
    VALUES (v_clean_phone, v_code, NOW() + INTERVAL '2 minutes');

    RETURN v_code;
END;
$$;

-- 3. Function to fetch dashboard data using OTP
CREATE OR REPLACE FUNCTION public.fetch_customer_dashboard(p_phone TEXT, p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_phone TEXT;
    v_valid BOOLEAN;
    v_customer RECORD;
    v_loans JSONB;
    v_payments JSONB;
BEGIN
    v_clean_phone := REGEXP_REPLACE(p_phone, '[^0-9]', '', 'g');
    IF v_clean_phone LIKE '0%' THEN
        v_clean_phone := '254' || SUBSTR(v_clean_phone, 2);
    END IF;

    -- Check OTP
    SELECT EXISTS (
        SELECT 1 FROM public.otp_codes 
        WHERE phone = v_clean_phone 
          AND code = p_code 
          AND used = FALSE 
          AND expires_at > NOW()
    ) INTO v_valid;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Invalid or expired OTP';
    END IF;

    -- Mark used
    UPDATE public.otp_codes 
    SET used = TRUE 
    WHERE phone = v_clean_phone AND code = p_code;

    -- Fetch customer
    SELECT * INTO v_customer FROM public.customers 
    WHERE phone LIKE '%' || SUBSTR(v_clean_phone, 4) OR phone = p_phone
    LIMIT 1;

    -- Fetch loans
    SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb) INTO v_loans
    FROM public.loans l
    WHERE l.customer_id = v_customer.id AND l.status NOT IN ('Rejected', 'Declined', 'Cancelled', 'Reversed');

    -- Fetch allocated payments for these loans
    SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb) INTO v_payments
    FROM public.payments p
    WHERE p.customer_id = v_customer.id AND p.status = 'Allocated';

    RETURN jsonb_build_object(
        'customer', row_to_json(v_customer),
        'loans', v_loans,
        'payments', v_payments
    );
END;
$$;