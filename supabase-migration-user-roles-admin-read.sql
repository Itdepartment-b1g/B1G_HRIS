-- ============================================================
-- B1G HRIS — Allow admins to read all user_roles
-- Fixes: Admins could not fetch other employees' roles for display/edit
-- Previously only super_admin could read all; now admin can too.
-- ============================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;

-- Create new policy: users read own, admins read all (for employee management)
CREATE POLICY "Users can read own role or admins read all"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );
