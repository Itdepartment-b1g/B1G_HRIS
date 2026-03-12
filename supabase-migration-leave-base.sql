-- ============================================================
-- B1G HRIS — Migration: Leave Base (prerequisite for leave-management)
-- Creates leave_type, leave_status enums and leave_requests table.
--
-- RUN ORDER:
--   1. supabase-migration-leave-base.sql      (this file)
--   2. supabase-migration-leave-management.sql
--   3. supabase-migration-leave-on-regular-status.sql
--   4. supabase-migration-ensure-leave-balance.sql
--
-- Requires: employees table, is_admin(), is_supervisor_of()
-- Safe to re-run: uses IF NOT EXISTS / duplicate_object handling
-- ============================================================

-- 1. leave_type ENUM
-- ============================================================
DO $$
BEGIN
  CREATE TYPE public.leave_type AS ENUM ('vacation', 'sick', 'personal', 'maternity', 'paternity');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. leave_status ENUM
-- ============================================================
DO $$
BEGIN
  CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. leave_requests TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status public.leave_status DEFAULT 'pending',
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

-- 4. Base RLS policies (leave-management will update these)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_requests' AND policyname = 'Employees insert own leave') THEN
    CREATE POLICY "Employees insert own leave"
      ON public.leave_requests FOR INSERT TO authenticated
      WITH CHECK (employee_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_requests' AND policyname = 'Employees read own leave or admin reads all') THEN
    CREATE POLICY "Employees read own leave or admin reads all"
      ON public.leave_requests FOR SELECT TO authenticated
      USING (employee_id = auth.uid() OR public.is_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_requests' AND policyname = 'Admins/supervisors update leave') THEN
    CREATE POLICY "Admins/supervisors update leave"
      ON public.leave_requests FOR UPDATE TO authenticated
      USING (
        public.is_admin(auth.uid())
        OR public.is_supervisor_of(auth.uid(), employee_id)
      );
  END IF;
END $$;

-- 5. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leave_employee ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_status ON public.leave_requests(status);
