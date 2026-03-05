-- ============================================================
-- B1G HRIS — Migration: Shifts & Employee Shift Assignment
-- Safe to re-run: uses IF NOT EXISTS throughout
-- ============================================================

-- 1. CREATE SHIFTS TABLE (if it doesn't exist yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  days        TEXT[] NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}',
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Add days column in case the table existed before this column was introduced
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS days TEXT[] NOT NULL DEFAULT '{Mon,Tue,Wed,Thu,Fri}';

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- 2. REMOVE OLD SINGLE shift_id column from employees (if it exists)
-- ============================================================

ALTER TABLE public.employees DROP COLUMN IF EXISTS shift_id;

-- 3. CREATE EMPLOYEE_SHIFTS JUNCTION TABLE (many-to-many)
--    An employee can be assigned multiple shifts
--    (e.g. On-site Mon–Fri + WFH Saturdays)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_shifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id    UUID NOT NULL REFERENCES public.shifts(id)    ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, shift_id)
);

ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shifts'
      AND policyname = 'All read shifts'
  ) THEN
    CREATE POLICY "All read shifts"
      ON public.shifts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shifts'
      AND policyname = 'Admins manage shifts'
  ) THEN
    CREATE POLICY "Admins manage shifts"
      ON public.shifts FOR ALL
      TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_shifts'
      AND policyname = 'All read employee_shifts'
  ) THEN
    CREATE POLICY "All read employee_shifts"
      ON public.employee_shifts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employee_shifts'
      AND policyname = 'Admins manage employee_shifts'
  ) THEN
    CREATE POLICY "Admins manage employee_shifts"
      ON public.employee_shifts FOR ALL
      TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;
