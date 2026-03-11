-- Security fix for attendance-photos storage
-- 1. Restrict read to authenticated users only (was TO public)
-- 2. Add path ownership: users can only access files under their own {userId}/... folder
-- Run after supabase-migration-storage-attendance.sql

-- Drop existing policies so we can replace them
DROP POLICY IF EXISTS "Anyone can view attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update attendance photos" ON storage.objects;

-- SELECT: only authenticated; only own folder {auth.uid()}/{...}
CREATE POLICY "Authenticated view own attendance photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: only own folder
CREATE POLICY "Authenticated upload own attendance photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: only own folder
CREATE POLICY "Authenticated update own attendance photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'attendance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
