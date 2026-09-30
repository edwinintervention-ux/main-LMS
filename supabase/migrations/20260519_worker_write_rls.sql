-- ================================================================
-- Migration: Worker Write RLS Policies
-- 
-- Problem: RLS was enabled on customers/loans/interactions/leads
-- but only SELECT policies existed. Workers (Loan Officers etc.)
-- could not INSERT or UPDATE rows from the Worker Portal because
-- no matching INSERT/UPDATE RLS policy existed for non-admins.
--
-- Fix: Add an is_active_worker() helper and granular INSERT/UPDATE
-- policies that allow any active, authenticated worker to:
--   • INSERT customers  (they onboard them)
--   • UPDATE customers  they onboarded or are assigned to
--   • INSERT loans      for customers they can read
--   • UPDATE loans      for customers they own
--   • INSERT/UPDATE interactions for their customers
--   • INSERT/UPDATE leads
-- ================================================================

-- ── 1. Helper: is any active worker logged in? ────────────────────
-- is_admin() already handles the admin case. This complements it.
CREATE OR REPLACE FUNCTION public.is_active_worker()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workers
    WHERE (
      email = auth.jwt() ->> 'email'
      OR auth_user_id = auth.uid()
    )
    AND status = 'Active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ── 2. CUSTOMERS ──────────────────────────────────────────────────

-- INSERT: any active worker can onboard a new customer.
-- (The worker's auth.uid() will be set as onboarded_by in application code.)
DROP POLICY IF EXISTS "Workers can insert customers" ON public.customers;
CREATE POLICY "Workers can insert customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_worker() OR public.is_admin());

-- UPDATE: worker can only update customers they onboarded or are assigned to.
DROP POLICY IF EXISTS "Workers can update their customers" ON public.customers;
CREATE POLICY "Workers can update their customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR assigned_officer = auth.uid()
    OR onboarded_by = auth.uid()
  )
  WITH CHECK (
    public.is_admin()
    OR assigned_officer = auth.uid()
    OR onboarded_by = auth.uid()
  );

-- ── 3. LOANS ─────────────────────────────────────────────────────

-- INSERT: worker can create a loan for a customer they can see.
DROP POLICY IF EXISTS "Workers can insert loans" ON public.loans;
CREATE POLICY "Workers can insert loans"
  ON public.loans FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- UPDATE: same ownership rule for updates.
DROP POLICY IF EXISTS "Workers can update their loans" ON public.loans;
CREATE POLICY "Workers can update their loans"
  ON public.loans FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.loans.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.loans.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- ── 4. INTERACTIONS ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Workers can insert interactions" ON public.interactions;
CREATE POLICY "Workers can insert interactions"
  ON public.interactions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Workers can update interactions" ON public.interactions;
CREATE POLICY "Workers can update interactions"
  ON public.interactions FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.interactions.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.interactions.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- ── 5. LEADS ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Workers can insert leads" ON public.leads;
CREATE POLICY "Workers can insert leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_worker() OR public.is_admin());

DROP POLICY IF EXISTS "Workers can update leads" ON public.leads;
CREATE POLICY "Workers can update leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (public.is_active_worker() OR public.is_admin())
  WITH CHECK (public.is_active_worker() OR public.is_admin());

-- ── 6. PAYMENTS ───────────────────────────────────────────────────
-- Workers may need to record manual payments against their customers.

DROP POLICY IF EXISTS "Workers can insert payments" ON public.payments;
CREATE POLICY "Workers can insert payments"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Workers can update payments" ON public.payments;
CREATE POLICY "Workers can update payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.payments.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.customers
      WHERE id = public.payments.customer_id
        AND (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- ── 7. AUDIT LOG ─────────────────────────────────────────────────
-- Workers must be able to write audit entries.

DROP POLICY IF EXISTS "Workers can insert audit_log" ON public.audit_log;
CREATE POLICY "Workers can insert audit_log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_worker() OR public.is_admin());

-- ── Grant service_role (edge functions) full access ───────────────
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.loans TO service_role;
GRANT ALL ON public.interactions TO service_role;
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.payments TO service_role;
GRANT ALL ON public.audit_log TO service_role;

NOTIFY pgrst, 'reload schema';
