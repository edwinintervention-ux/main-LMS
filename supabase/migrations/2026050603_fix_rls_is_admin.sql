-- ================================================================
-- MIGRATION: Fix Granular RLS - Customers/Loans/Payments not loading
-- 
-- Root cause: The is_admin() function uses auth.jwt() ->> 'email'
-- to look up workers, but this can fail if the email doesn't match
-- exactly or JWT claims are not propagated correctly.
-- 
-- Fix 1: Strengthen is_admin() to also check auth_user_id
-- Fix 2: Add a fallback policy allowing admins to view ALL customers
--        since assigned_officer is NULL for most existing customers
-- ================================================================

-- 1. Strengthen is_admin() to check BOTH email and auth_user_id
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.workers 
    WHERE (
      email = auth.jwt() ->> 'email'
      OR auth_user_id = auth.uid()
    )
    AND (role::text ILIKE '%Admin%' OR role::text ILIKE 'Director')
    AND status = 'Active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2. Fix the Granular customer read policy
-- The old policy fails when assigned_officer and onboarded_by are NULL (most existing customers)
DROP POLICY IF EXISTS "Granular customer read" ON public.customers;
CREATE POLICY "Granular customer read"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR 
    assigned_officer = auth.uid() OR 
    onboarded_by = auth.uid()
  );

-- 3. Fix Granular loan read policy
DROP POLICY IF EXISTS "Granular loan read" ON public.loans;
CREATE POLICY "Granular loan read"
  ON public.loans FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR 
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE id = public.loans.customer_id AND 
      (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- 4. Fix Granular payment read policy
DROP POLICY IF EXISTS "Granular payment read" ON public.payments;
CREATE POLICY "Granular payment read"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR 
    EXISTS (
      SELECT 1 FROM public.customers 
      WHERE id = public.payments.customer_id AND 
      (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

-- 5. Fix Granular interaction read policy
DROP POLICY IF EXISTS "Granular interaction read" ON public.interactions;
CREATE POLICY "Granular interaction read"
  ON public.interactions FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR 
    customer_id IN (
      SELECT id FROM public.customers 
      WHERE (assigned_officer = auth.uid() OR onboarded_by = auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
