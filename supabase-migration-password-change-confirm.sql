-- Pending password changes: applied only after the employee clicks Confirm in email.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.password_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  new_password_enc TEXT NOT NULL,
  selfie TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('forgot_password', 'settings')),
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_change_requests_employee_idx
  ON public.password_change_requests (employee_id, created_at DESC);

ALTER TABLE public.password_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "password_change_requests_no_direct_access" ON public.password_change_requests;
-- No policies for anon/authenticated: only service_role (edge functions) can read/write.
