-- Allow admin + super_admin to manage company_profile.
-- This aligns with the UI (CompanyProfile.tsx) which allows both roles to edit.

-- Drop the old super_admin-only policy if it exists.
DROP POLICY IF EXISTS "Super admin manages company" ON public.company_profile;

-- Admins (admin + super_admin) can insert rows.
DROP POLICY IF EXISTS "Admins insert company profile" ON public.company_profile;
CREATE POLICY "Admins insert company profile"
  ON public.company_profile FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins (admin + super_admin) can update rows.
DROP POLICY IF EXISTS "Admins update company profile" ON public.company_profile;
CREATE POLICY "Admins update company profile"
  ON public.company_profile FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins (admin + super_admin) can delete rows.
DROP POLICY IF EXISTS "Admins delete company profile" ON public.company_profile;
CREATE POLICY "Admins delete company profile"
  ON public.company_profile FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

