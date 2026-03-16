-- ============================================================
-- B1G HRIS — Storage: Profile Pictures Bucket
-- Bucket for employee profile/avatar photos.
-- Public so avatars display in org chart, lists, etc. without signed URLs.
-- Safe to re-run.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own folder: {auth.uid()}/avatar.jpg
DROP POLICY IF EXISTS "Authenticated upload own profile picture" ON storage.objects;
CREATE POLICY "Authenticated upload own profile picture"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own file (overwrite on re-upload)
DROP POLICY IF EXISTS "Authenticated update own profile picture" ON storage.objects;
CREATE POLICY "Authenticated update own profile picture"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-pictures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public view so profile pics display everywhere (org chart, employee lists, etc.)
DROP POLICY IF EXISTS "Public view profile pictures" ON storage.objects;
CREATE POLICY "Public view profile pictures"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-pictures');

-- ============================================================
-- Allow users to update their own employees.avatar_url
-- ============================================================
DROP POLICY IF EXISTS "Users update own avatar" ON public.employees;
CREATE POLICY "Users update own avatar"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (id = auth.uid());
