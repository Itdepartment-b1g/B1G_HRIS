-- ============================================================
-- B1G HRIS — Overtime Management System
-- Extends overtime_requests, adds storage bucket, RLS for approvers
-- Requires: is_approver_of() from leave-management migration
-- Safe to re-run.
-- ============================================================

-- 1. EXTEND overtime_requests TABLE
-- ============================================================
ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.overtime_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. UPDATE overtime_requests RLS: include is_approver_of (employee_supervisors)
-- ============================================================
DROP POLICY IF EXISTS "Read own or admin overtime" ON public.overtime_requests;
CREATE POLICY "Read own or admin overtime"
  ON public.overtime_requests FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

DROP POLICY IF EXISTS "Admin/supervisor update overtime" ON public.overtime_requests;
CREATE POLICY "Admin/supervisor update overtime"
  ON public.overtime_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

-- 3. OT ATTACHMENTS STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('ot-attachments', 'ot-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload ot attachments" ON storage.objects;
CREATE POLICY "Authenticated upload ot attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ot-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated view ot attachments" ON storage.objects;
CREATE POLICY "Authenticated view ot attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'ot-attachments');
