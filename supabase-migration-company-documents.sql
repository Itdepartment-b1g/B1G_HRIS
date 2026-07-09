-- Add document URL columns
ALTER TABLE public.company_profile
  ADD COLUMN IF NOT EXISTS code_conduct_url TEXT,
  ADD COLUMN IF NOT EXISTS hand_book_url TEXT;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Admins upload company documents
DROP POLICY IF EXISTS "Admins upload company documents" ON storage.objects;
CREATE POLICY "Admins upload company documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-documents'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Admins update company documents" ON storage.objects;
CREATE POLICY "Admins update company documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'company-documents' AND public.is_admin(auth.uid()))
  WITH CHECK (bucket_id = 'company-documents' AND public.is_admin(auth.uid()));

-- All authenticated users can view (employees need to read handbook / code of conduct)
DROP POLICY IF EXISTS "Authenticated view company documents" ON storage.objects;
CREATE POLICY "Authenticated view company documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'company-documents');

-- Admins delete company documents (replace / remove)
DROP POLICY IF EXISTS "Admins delete company documents" ON storage.objects;
CREATE POLICY "Admins delete company documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND public.is_admin(auth.uid())
  );
