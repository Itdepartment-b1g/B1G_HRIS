-- Allow users to read their own survey responses.
-- Required for insert(...).select('id') to work - PostgREST needs SELECT permission
-- to return the inserted row. Previously only admins could SELECT.

CREATE POLICY "Users read own survey responses"
  ON public.survey_responses FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid() OR employee_id IS NULL);
