-- ================================================================
-- MIGRATION: Fix workers_management_policy RLS bug
--
-- Root cause: The workers_management_policy used `role::text = 'Admin'`
-- which checks the WORKER ROW'S role, NOT the logged-in user's role.
-- This means:
--   - When DON (Super Admin) tries to update Jane (Loan Officer),
--     the check becomes: Jane's role 'Loan Officer' = 'Admin' → FALSE
--   - RLS silently blocks the update, no error is thrown, 0 rows affected
--   - The frontend shows "saved" toast but nothing persists
--
-- Fix: Use public.is_admin() which checks the CURRENT USER's role in
-- the workers table via auth.jwt() email AND auth.uid()
-- ================================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "workers_management_policy" ON public.workers;

-- Create correct policy using is_admin() for admin access
-- and auth_user_id matching for workers editing their own record
CREATE POLICY "workers_management_policy" ON public.workers
  FOR ALL TO authenticated
  USING (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR email = auth.jwt() ->> 'email'
  )
  WITH CHECK (
    public.is_admin()
    OR auth_user_id = auth.uid()
    OR email = auth.jwt() ->> 'email'
  );

NOTIFY pgrst, 'reload schema';
