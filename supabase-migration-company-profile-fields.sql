-- Add company profile fields for vision, mission, core values, mobile, telephone
-- Allow admin and super_admin to update (was super_admin only)
-- ============================================================

-- 1. Add new columns to company_profile
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS mobile_number TEXT,
  ADD COLUMN IF NOT EXISTS telephone_number TEXT,
  ADD COLUMN IF NOT EXISTS vision TEXT,
  ADD COLUMN IF NOT EXISTS mission TEXT,
  ADD COLUMN IF NOT EXISTS core_values TEXT;

-- 2. Update RLS: allow admin and super_admin to manage (not just super_admin)
DROP POLICY IF EXISTS "Super admin manages company" ON public.company_profile;

CREATE POLICY "Admins manage company profile"
  ON public.company_profile FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
