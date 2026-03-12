-- ============================================================
-- B1G HRIS — Storage: Sick Leave Attachments Bucket
-- Bucket for SL (Sick Leave) medical certificates / supporting docs.
-- Attachments allow bypassing the 2-hour-before-shift rule for same-day SL.
-- Safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('sl-attachments', 'sl-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder: {auth.uid()}/...
DROP POLICY IF EXISTS "Authenticated upload sl attachments" ON storage.objects;
CREATE POLICY "Authenticated upload sl attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sl-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated view sl attachments" ON storage.objects;
CREATE POLICY "Authenticated view sl attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'sl-attachments');
