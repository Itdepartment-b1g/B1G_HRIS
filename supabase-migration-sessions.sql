-- ============================================================
-- B1G HRIS — Migration: User Sessions tracking
-- Safe to re-run: uses IF NOT EXISTS throughout
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  platform      TEXT,
  browser       TEXT,
  last_active   TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'Users read own sessions'
  ) THEN
    CREATE POLICY "Users read own sessions"
      ON public.user_sessions FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'Users manage own sessions'
  ) THEN
    CREATE POLICY "Users manage own sessions"
      ON public.user_sessions FOR ALL
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;
