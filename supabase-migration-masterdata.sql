-- ============================================================
-- B1G HRIS — Migration: Employment Statuses, Work Locations, Holidays
-- Safe to re-run: uses IF NOT EXISTS throughout
-- ============================================================

-- 1. EMPLOYMENT STATUSES
-- e.g. Probationary (6 months), Regular, Contractual (12 months)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employment_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  duration_months INTEGER,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.employment_statuses ENABLE ROW LEVEL SECURITY;

-- 2. WORK LOCATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;

-- 3. HOLIDAYS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  date        DATE NOT NULL,
  type        TEXT DEFAULT 'regular',
  is_recurring BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES
-- ============================================================

DO $$
BEGIN
  -- employment_statuses
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employment_statuses' AND policyname = 'All read employment_statuses') THEN
    CREATE POLICY "All read employment_statuses" ON public.employment_statuses FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employment_statuses' AND policyname = 'Admins manage employment_statuses') THEN
    CREATE POLICY "Admins manage employment_statuses" ON public.employment_statuses FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;

  -- work_locations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'work_locations' AND policyname = 'All read work_locations') THEN
    CREATE POLICY "All read work_locations" ON public.work_locations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'work_locations' AND policyname = 'Admins manage work_locations') THEN
    CREATE POLICY "Admins manage work_locations" ON public.work_locations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;

  -- holidays
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'holidays' AND policyname = 'All read holidays') THEN
    CREATE POLICY "All read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'holidays' AND policyname = 'Admins manage holidays') THEN
    CREATE POLICY "Admins manage holidays" ON public.holidays FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;
END $$;
