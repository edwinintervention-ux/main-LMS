-- ================================================================
-- MIGRATION: Fix Customer Tagging + Add customer_tag to customers
-- ================================================================

-- 1. Add current-tag columns to customers for quick lookup
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_tag text,
  ADD COLUMN IF NOT EXISTS customer_tag_reason text;

-- Add check constraint (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_tag_check') THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_customer_tag_check CHECK (customer_tag IN ('Red', 'Amber'));
  END IF;
END $$;

-- 2. Fix customer_tags table issues from original migration
-- Drop broken policies
DROP POLICY IF EXISTS "allow_insert" ON public.customer_tags;
DROP POLICY IF EXISTS "allow_delete_admin" ON public.customer_tags;

-- Widen CHECK to allow 'Removed' entries (for audit trail)
ALTER TABLE public.customer_tags DROP CONSTRAINT IF EXISTS customer_tags_tag_type_check;
ALTER TABLE public.customer_tags
  ADD CONSTRAINT customer_tags_tag_type_check CHECK (tag_type IN ('Red', 'Amber', 'Removed'));

-- Make applied_by nullable (was NOT NULL without a usable default — inserts were failing)
ALTER TABLE public.customer_tags ALTER COLUMN applied_by DROP NOT NULL;

-- Add applied_by_name for human-readable display
ALTER TABLE public.customer_tags ADD COLUMN IF NOT EXISTS applied_by_name text;

-- 3. Recreate correct RLS policies
CREATE POLICY "authenticated_can_insert_tags" ON public.customer_tags
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_can_select_tags" ON public.customer_tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_can_delete_tags" ON public.customer_tags
  FOR DELETE TO authenticated USING (true);

-- 4. Grants
GRANT SELECT, INSERT, DELETE ON public.customer_tags TO authenticated;
