-- ============================================================
-- B1G HRIS — Migration: Employee Departments (Multi-Department)
-- Allows 1 or more departments per employee via junction table
-- ============================================================

-- 1. EMPLOYEE_DEPARTMENTS JUNCTION TABLE (many-to-many)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.employee_departments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id    UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, department_id)
);

ALTER TABLE public.employee_departments ENABLE ROW LEVEL SECURITY;

-- 2. RLS POLICIES
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_departments' AND policyname = 'All read employee_departments') THEN
    CREATE POLICY "All read employee_departments"
      ON public.employee_departments FOR SELECT
      TO authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'employee_departments' AND policyname = 'Admins manage employee_departments') THEN
    CREATE POLICY "Admins manage employee_departments"
      ON public.employee_departments FOR ALL
      TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;
END $$;

-- 3. INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_employee_departments_emp ON public.employee_departments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_departments_dept ON public.employee_departments(department_id);

-- 4. MIGRATE EXISTING department_id DATA
-- ============================================================
-- Populate employee_departments from existing employees.department_id
-- (no-op if department_id is null or already present)

INSERT INTO public.employee_departments (employee_id, department_id)
SELECT e.id, e.department_id
FROM public.employees e
WHERE e.department_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_departments ed
    WHERE ed.employee_id = e.id AND ed.department_id = e.department_id
  );
