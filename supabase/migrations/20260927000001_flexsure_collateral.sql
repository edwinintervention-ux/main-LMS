-- ─── FlexSure Collateral Support ─────────────────────────────────────────────
-- Adds a JSONB collateral column to the loans table.
-- This stores all collateral details for FlexSure (secured) loans.
--
-- Schema of the collateral JSON object:
--   {
--     "name":        string  – item name / description
--     "serial":      string  – serial number or identifier
--     "marketValue": number  – verified market value in KES
--     "condition":   string  – "Good" | "Fair" | "Poor"
--     "storage":     string  – where the item is held
--     "status":      string  – "Held" | "Released" | "Liquidated"
--     "notes":       string  – optional extra notes
--   }

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS collateral jsonb DEFAULT NULL;

-- Index on collateral->status for the collateral register view
CREATE INDEX IF NOT EXISTS idx_loans_collateral_status
  ON public.loans USING gin (collateral)
  WHERE collateral IS NOT NULL;

COMMENT ON COLUMN public.loans.collateral IS
  'FlexSure secured-loan collateral metadata (JSONB). NULL for all other products.';
