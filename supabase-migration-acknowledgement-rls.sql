-- Allow employees to read their own announcement and policy acknowledgements.
-- Previously only admins could SELECT; employees need this for ActivityPopup to
-- correctly filter out already-acknowledged items (avoids 409 on duplicate insert).

CREATE POLICY "Employees read own announcement acknowledgements"
  ON public.announcement_acknowledgements FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Employees read own policy acknowledgements"
  ON public.policy_acknowledgements FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());
