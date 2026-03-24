-- ============================================================
-- B1G HRIS — Allow all authenticated users to read user_roles
-- Fixes: Org chart inconsistent between admin and employee POV
--
-- Previously: Employees could only read their own role (RLS).
-- Admins got full roleMap → correct Supervisor/Employee/Intern labels.
-- Employees got incomplete roleMap → others defaulted to "Employee".
--
-- Role labels are display-only for the org chart and are not sensitive.
-- This aligns employee view with admin view.
-- ============================================================

DROP POLICY IF EXISTS "Users can read own role or admins read all" ON public.user_roles;

CREATE POLICY "All authenticated can read user_roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);
