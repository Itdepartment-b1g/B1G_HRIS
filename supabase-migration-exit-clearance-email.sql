-- Exit clearance emails
-- Run this in the Supabase SQL editor after supabase-migration-exit-clearance.sql.
-- Then deploy: supabase functions deploy send-clearance-emails
--
-- The in-app notice is created on the last working day (not before).
-- Each of those notices queues one email. A job at 08:15 Asia/Manila sends
-- the queue once. Opening Offboarding does not send email.
--
-- The morning mail job reads two Vault secrets:
--   select vault.create_secret('https://bkwesxfggltwaobpmhba.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'secret_key');
-- HR actions (start on the last day, change the date, add an item, Remind)
-- send immediately and do not need those secrets.

CREATE TABLE IF NOT EXISTS public.clearance_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clearance_id UUID REFERENCES public.employee_clearances(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  kind TEXT NOT NULL DEFAULT 'due',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clearance_email_outbox_unsent
  ON public.clearance_email_outbox (created_at)
  WHERE sent_at IS NULL;

ALTER TABLE public.clearance_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._clearance_queue_email_from_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_clearance UUID;
BEGIN
  IF NEW.type IS DISTINCT FROM 'offboarding' THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(e.email), '')
    INTO v_email
  FROM public.employees e
  WHERE e.id = NEW.user_id;

  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_clearance := NULLIF(NEW.metadata->>'clearance_id', '')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_clearance := NULL;
  END;

  INSERT INTO public.clearance_email_outbox (
    clearance_id, user_id, email, subject, body, action_url, kind
  )
  VALUES (
    v_clearance,
    NEW.user_id,
    v_email,
    NEW.title,
    NEW.message,
    NEW.action_url,
    COALESCE(NULLIF(NEW.metadata->>'kind', ''), 'due')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clearance_queue_email ON public.user_notifications;
CREATE TRIGGER trg_clearance_queue_email
  AFTER INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public._clearance_queue_email_from_notification();

-- One email for each person who already has an in-app notice on an open clearance.
INSERT INTO public.clearance_email_outbox (
  clearance_id, user_id, email, subject, body, action_url, kind
)
SELECT DISTINCT ON (n.user_id, (n.metadata->>'clearance_id'))
  (n.metadata->>'clearance_id')::UUID,
  n.user_id,
  btrim(e.email),
  n.title,
  n.message,
  n.action_url,
  COALESCE(NULLIF(n.metadata->>'kind', ''), 'due')
FROM public.user_notifications n
JOIN public.employees e ON e.id = n.user_id
JOIN public.employee_clearances c ON c.id = (n.metadata->>'clearance_id')::UUID
WHERE n.type = 'offboarding'
  AND c.status = 'in_progress'
  AND NULLIF(btrim(e.email), '') IS NOT NULL
  AND n.metadata->>'clearance_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.clearance_email_outbox o
    WHERE o.user_id = n.user_id
      AND o.clearance_id = c.id
  )
ORDER BY n.user_id, (n.metadata->>'clearance_id'), n.created_at DESC;

-- Sends the queued emails. The browser does not call this.
-- 08:15 Asia/Manila, five minutes after the notice job.
CREATE OR REPLACE FUNCTION public.clearance_invoke_email_sender()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := 'https://bkwesxfggltwaobpmhba.supabase.co';
  v_vault_url TEXT;
  v_key TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net is not enabled. Exit clearance email stays queued.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    BEGIN
      SELECT NULLIF(btrim(decrypted_secret), '')
        INTO v_key
      FROM vault.decrypted_secrets
      WHERE name IN ('secret_key', 'service_role_key')
        AND NULLIF(btrim(decrypted_secret), '') IS NOT NULL
      ORDER BY CASE name WHEN 'secret_key' THEN 0 ELSE 1 END
      LIMIT 1;

      SELECT NULLIF(btrim(decrypted_secret), '')
        INTO v_vault_url
      FROM vault.decrypted_secrets
      WHERE name = 'project_url'
        AND NULLIF(btrim(decrypted_secret), '') IS NOT NULL
      LIMIT 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not read Vault secrets for exit clearance email.';
        RETURN;
    END;
  END IF;

  IF v_vault_url IS NOT NULL THEN
    v_url := v_vault_url;
  END IF;

  IF v_key IS NULL THEN
    RAISE NOTICE 'Add a Vault secret named secret_key so the 08:15 job can send exit clearance email.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-clearance-emails',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_key,
      'Authorization', 'Bearer ' || v_key
    ),
    timeout_milliseconds := 120000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clearance_invoke_email_sender() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clearance_email_daily') THEN
      PERFORM cron.unschedule('clearance_email_daily');
    END IF;
    PERFORM cron.schedule(
      'clearance_email_daily',
      '15 0 * * *',
      $cron$SELECT public.clearance_invoke_email_sender()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled. Schedule public.clearance_invoke_email_sender() once a day at 08:15 Asia/Manila.';
  END IF;
END $$;
