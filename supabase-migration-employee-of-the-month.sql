-- ============================================================
-- B1G HRIS — Employee of the Month + Pinned Announcements
-- Safe to re-run.
-- ============================================================

-- 1. EMPLOYEE OF THE MONTH
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employee_of_the_month (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  for_month DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(for_month)
);

ALTER TABLE public.employee_of_the_month ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated read employee of the month" ON public.employee_of_the_month;
CREATE POLICY "All authenticated read employee of the month"
  ON public.employee_of_the_month FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage employee of the month" ON public.employee_of_the_month;
CREATE POLICY "Admins manage employee of the month"
  ON public.employee_of_the_month FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 2. PINNED ANNOUNCEMENTS
-- ============================================================
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
