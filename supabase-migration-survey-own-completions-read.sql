-- Allow users to read their own survey completions.
-- Required so "already taken" / pending-survey checks work for anonymous surveys
-- (those mark completion in survey_completions, not survey_responses.employee_id).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'survey_completions'
      AND policyname = 'Users read own survey completions'
  ) THEN
    CREATE POLICY "Users read own survey completions"
      ON public.survey_completions FOR SELECT
      TO authenticated
      USING (employee_id = auth.uid());
  END IF;

  -- Ensure users can also read their own non-anonymous survey responses
  -- (needed for insert(...).select and for "already taken" checks).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'survey_responses'
      AND policyname = 'Users read own survey responses'
  ) THEN
    CREATE POLICY "Users read own survey responses"
      ON public.survey_responses FOR SELECT
      TO authenticated
      USING (employee_id = auth.uid() OR employee_id IS NULL);
  END IF;
END $$;
