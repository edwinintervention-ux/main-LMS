-- Add product column to leads table to track which product a lead is interested in
-- Default is 'Standard' to match existing leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'Standard';

COMMENT ON COLUMN public.leads.product IS
  'Product the lead is interested in. e.g. Standard, FlexSure. Used to tailor the conversion (onboarding) form.';
