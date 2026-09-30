CREATE OR REPLACE FUNCTION public.add_signature_columns()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='borrower_signature') THEN
    ALTER TABLE public.loans ADD COLUMN borrower_signature TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='loans' AND column_name='officer_signature') THEN
    ALTER TABLE public.loans ADD COLUMN officer_signature TEXT;
  END IF;
END;
$$;

-- Call the function to ensure columns exist
SELECT public.add_signature_columns();
