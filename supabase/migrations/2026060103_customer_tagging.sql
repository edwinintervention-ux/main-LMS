CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table to store customer tags (Red: Bad Faith, Amber: Bad Luck)
CREATE TABLE public.customer_tags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tag_type text NOT NULL CHECK (tag_type IN ('Red', 'Amber')),
  reason text NOT NULL,
  applied_by uuid NOT NULL, -- reference to supabase auth user id
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for quick lookup by customer
CREATE INDEX idx_customer_tags_customer_id ON public.customer_tags(customer_id);

-- Row-level security: only staff can insert, and only admins can delete
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

-- Policy: allow any authenticated user to insert a tag (they must provide applied_by)
CREATE POLICY "allow_insert" ON public.customer_tags FOR INSERT TO authenticated USING (true);

-- Policy: allow admin role to delete tags
CREATE POLICY "allow_delete_admin" ON public.customer_tags FOR DELETE TO admin USING (true);

-- No UPDATE: tags are immutable; changes require new record.

-- Grant select to all staff (authenticated)
GRANT SELECT ON public.customer_tags TO authenticated;
