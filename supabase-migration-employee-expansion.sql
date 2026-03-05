-- ============================================================
-- B1G HRIS — Migration: Employee Expansion
-- Positions, Cost Centers, Geofencing, Junction Tables, Employee Fields
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ============================================================

-- 1. EXTEND app_role ENUM
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'executive';

-- 2. POSITIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.positions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- 3. COST CENTERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;

-- 4. EXTEND WORK_LOCATIONS WITH GEOFENCING
-- ============================================================

ALTER TABLE public.work_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.work_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.work_locations ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 100;
ALTER TABLE public.work_locations ADD COLUMN IF NOT EXISTS allow_anywhere BOOLEAN DEFAULT false;

-- 5. EMPLOYEE_WORK_LOCATIONS JUNCTION TABLE (many-to-many)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_work_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  work_location_id UUID NOT NULL REFERENCES public.work_locations(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, work_location_id)
);

ALTER TABLE public.employee_work_locations ENABLE ROW LEVEL SECURITY;

-- 6. EMPLOYEE_SUPERVISORS JUNCTION TABLE (max 2 per employee)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_supervisors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, supervisor_id)
);

ALTER TABLE public.employee_supervisors ENABLE ROW LEVEL SECURITY;

-- 7. ADD NEW COLUMNS TO EMPLOYEES TABLE
-- ============================================================

-- Personal fields
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS middle_name TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS suffix TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS birthplace TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS civil_status TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS personal_email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS present_address TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS permanent_address TEXT;

-- Employment FK fields
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_status_id UUID REFERENCES public.employment_statuses(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES public.cost_centers(id);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company_email TEXT;

-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================

DO $$
BEGIN
  -- positions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'positions' AND policyname = 'All read positions') THEN
    CREATE POLICY "All read positions" ON public.positions FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'positions' AND policyname = 'Admins manage positions') THEN
    CREATE POLICY "Admins manage positions" ON public.positions FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;

  -- cost_centers
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_centers' AND policyname = 'All read cost_centers') THEN
    CREATE POLICY "All read cost_centers" ON public.cost_centers FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_centers' AND policyname = 'Admins manage cost_centers') THEN
    CREATE POLICY "Admins manage cost_centers" ON public.cost_centers FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;

  -- employee_work_locations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_work_locations' AND policyname = 'All read employee_work_locations') THEN
    CREATE POLICY "All read employee_work_locations" ON public.employee_work_locations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_work_locations' AND policyname = 'Admins manage employee_work_locations') THEN
    CREATE POLICY "Admins manage employee_work_locations" ON public.employee_work_locations FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;

  -- employee_supervisors
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_supervisors' AND policyname = 'All read employee_supervisors') THEN
    CREATE POLICY "All read employee_supervisors" ON public.employee_supervisors FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_supervisors' AND policyname = 'Admins manage employee_supervisors') THEN
    CREATE POLICY "Admins manage employee_supervisors" ON public.employee_supervisors FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
  END IF;
END $$;

-- 9. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_employee_work_locations_emp ON public.employee_work_locations(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_supervisors_emp ON public.employee_supervisors(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_position ON public.employees(position_id);
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON public.employees(employment_status_id);
