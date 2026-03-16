-- ============================================================
-- B1G HRIS — Business Trip: Extend schema and RLS
-- Add trip_type, attachment_url to business_trips; add business_trip_id to
-- attendance_records; update RLS to include is_approver_of.
-- Safe to re-run.
-- ============================================================

-- 1. Extend business_trips
-- ============================================================
ALTER TABLE public.business_trips
  ADD COLUMN IF NOT EXISTS trip_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- 2. Extend attendance_records for Business Trip (Present) tagging
-- ============================================================
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS business_trip_id UUID REFERENCES public.business_trips(id) ON DELETE SET NULL;

-- 3. Update business_trips RLS: include is_approver_of (matching leave/overtime)
-- ============================================================
DROP POLICY IF EXISTS "Read own or admin trips" ON public.business_trips;
CREATE POLICY "Read own or admin trips"
  ON public.business_trips FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

DROP POLICY IF EXISTS "Admin/supervisor update trip" ON public.business_trips;
CREATE POLICY "Admin/supervisor update trip"
  ON public.business_trips FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

-- 4. TRIP ATTACHMENTS STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-attachments', 'trip-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload trip attachments" ON storage.objects;
CREATE POLICY "Authenticated upload trip attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'trip-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated view trip attachments" ON storage.objects;
CREATE POLICY "Authenticated view trip attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'trip-attachments');
