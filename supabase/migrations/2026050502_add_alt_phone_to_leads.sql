-- MIGRATION: Add alt_phone to leads table
-- Standardizing multi-number support for administrative contact reliability.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='alt_phone') THEN
        ALTER TABLE public.leads ADD COLUMN alt_phone TEXT;
    END IF;
END $$;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
