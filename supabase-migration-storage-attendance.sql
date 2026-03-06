-- Create attendance-photos bucket for time in/out photo capture
-- Run this in Supabase SQL Editor or as migration
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-photos', 'attendance-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own attendance photos (drop first if re-running)
DROP POLICY IF EXISTS "Authenticated upload attendance photos" ON storage.objects;
CREATE POLICY "Authenticated upload attendance photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attendance-photos');

-- UPDATE required for upsert: true (overwrite existing same-day photo)
DROP POLICY IF EXISTS "Authenticated update attendance photos" ON storage.objects;
CREATE POLICY "Authenticated update attendance photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attendance-photos')
  WITH CHECK (bucket_id = 'attendance-photos');

DROP POLICY IF EXISTS "Anyone can view attendance photos" ON storage.objects;
CREATE POLICY "Anyone can view attendance photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'attendance-photos');
