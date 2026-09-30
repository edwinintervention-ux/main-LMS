-- Migration to support Multi-Factor Authentication (MFA) for Admins
-- Adds OTP and Biometric support to the workers table

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS mfa_phone TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS otp_code TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS biometric_data JSONB DEFAULT '[]'::JSONB;

-- Comment on columns for clarity
COMMENT ON COLUMN public.workers.mfa_enabled IS 'Whether 2FA is required for this admin';
COMMENT ON COLUMN public.workers.mfa_phone IS 'The phone number to send OTP to (defaults to worker phone)';
COMMENT ON COLUMN public.workers.otp_code IS 'Current active 4-digit OTP code';
COMMENT ON COLUMN public.workers.otp_expires_at IS 'Expiry time for the current OTP code';
COMMENT ON COLUMN public.workers.biometric_data IS 'Registered WebAuthn/Biometric credentials';

-- Update RLS if necessary
-- The existing policies usually allow admins to manage workers, which includes themselves.
