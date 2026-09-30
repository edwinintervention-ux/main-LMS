-- ================================================================
-- MIGRATION: Fix Collections Officer Data Access (RLS)
--
-- Root cause: RLS policies on customers/loans/payments/interactions
-- only allowed data access for admins, assigned_officer (UUID), or
-- onboarded_by (UUID). Collections Officers are linked to loans via
-- the TEXT field loans.collections_officer — they had no UUID-based
-- relationship with customers/loans so they saw zero data.
--
-- Fix: Allow any authenticated active worker to read all data.
-- The Worker Portal frontend already filters data by role/officer
-- (CollectionsDashboard filters loans by l.collectionsOfficer === worker.name).
-- RLS at the table level should only ensure authenticated workers
-- can access the data — granular business filtering is frontend's job.
-- ================================================================

-- ── 1. CUSTOMERS ──────────────────────────────────────────────────
-- Allow all active workers (including Collections Officers) to read customers.
DROP POLICY IF EXISTS "Granular customer read" ON public.customers;
CREATE POLICY "Workers can read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_active_worker()
  );

-- ── 2. LOANS ─────────────────────────────────────────────────────
-- Allow all active workers to read loans.
-- Collections Officers are linked via loans.collections_officer (text),
-- not via UUID, so we must open read access at the worker level.
DROP POLICY IF EXISTS "Granular loan read" ON public.loans;
CREATE POLICY "Workers can read loans"
  ON public.loans FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_active_worker()
  );

-- ── 3. PAYMENTS ───────────────────────────────────────────────────
-- Allow all active workers to read payments (needed for portfolio views).
DROP POLICY IF EXISTS "Granular payment read" ON public.payments;
DROP POLICY IF EXISTS "View Payments" ON public.payments;
CREATE POLICY "Workers can read payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_active_worker()
  );

-- ── 4. INTERACTIONS ───────────────────────────────────────────────
-- Allow all active workers to read interactions.
DROP POLICY IF EXISTS "Granular interaction read" ON public.interactions;
CREATE POLICY "Workers can read interactions"
  ON public.interactions FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_active_worker()
  );

-- ── 5. Update workers INSERT/UPDATE for Collections Officers ───────
-- Collections Officers need to be able to insert interactions
-- (e.g., Promise-to-Pay records) for ANY loan in their portfolio,
-- not just customers they personally assigned_officer or onboarded_by.
-- Drop the old ownership-gated policies and replace with is_active_worker.
DROP POLICY IF EXISTS "Workers can insert interactions" ON public.interactions;
CREATE POLICY "Workers can insert interactions"
  ON public.interactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_active_worker() OR public.is_admin());

DROP POLICY IF EXISTS "Workers can update interactions" ON public.interactions;
CREATE POLICY "Workers can update interactions"
  ON public.interactions FOR UPDATE
  TO authenticated
  USING (public.is_active_worker() OR public.is_admin())
  WITH CHECK (public.is_active_worker() OR public.is_admin());

NOTIFY pgrst, 'reload schema';
