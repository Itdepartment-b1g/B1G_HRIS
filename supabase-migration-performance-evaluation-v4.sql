-- ============================================================
-- B1G HRIS — Performance Evaluation v4
-- 1. Active stays "can be used in Create Evaluation".
--    auto_create separately turns the daily schedule on.
-- 2. Probationary (months-after-hire) notices, each sent once:
--    - created: admin and super admin
--    - not created yet: HR, admin, and super admin, N days before
--      the due date (performance_settings.reminder_days_before)
--
-- RUN AFTER supabase-migration-performance-evaluation-v3.sql.
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.performance_form_templates
  ADD COLUMN IF NOT EXISTS auto_create BOOLEAN NOT NULL DEFAULT FALSE;

-- Forms that already create on a schedule keep doing so.
UPDATE public.performance_form_templates
SET auto_create = TRUE
WHERE is_active
  AND schedule_type <> 'manual'
  AND auto_create = FALSE;

CREATE TABLE IF NOT EXISTS public.performance_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('created', 'needs_create')),
  subject TEXT NOT NULL,
  line TEXT NOT NULL,
  recipient_emails TEXT[] NOT NULL DEFAULT '{}',
  recipient_ids UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE public.performance_email_outbox ENABLE ROW LEVEL SECURITY;

-- Who receives a probationary notice. Email prefers company email.
CREATE OR REPLACE FUNCTION public._perf_notice_people(p_include_hr BOOLEAN)
RETURNS TABLE(user_id UUID, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT e.id,
    NULLIF(btrim(COALESCE(NULLIF(btrim(e.company_email), ''), NULLIF(btrim(e.email), ''))), '')
  FROM public.user_roles ur
  JOIN public.employees e ON e.id = ur.user_id
  WHERE ur.role IN ('admin', 'super_admin')
    AND e.is_active

  UNION

  SELECT DISTINCT e.id,
    NULLIF(btrim(COALESCE(NULLIF(btrim(e.company_email), ''), NULLIF(btrim(e.email), ''))), '')
  FROM public.performance_settings s
  JOIN public.employee_departments ed ON ed.department_id = s.hr_department_id
  JOIN public.employees e ON e.id = ed.employee_id AND e.is_active
  WHERE p_include_hr
    AND s.id = 1
    AND s.hr_department_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._perf_enqueue_notice(
  p_kind TEXT,
  p_notice_key TEXT,
  p_subject TEXT,
  p_line TEXT,
  p_include_hr BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_emails TEXT[];
  v_inserted INT;
BEGIN
  SELECT
    COALESCE(array_agg(DISTINCT n.user_id), '{}'::UUID[]),
    COALESCE(array_agg(DISTINCT n.email) FILTER (WHERE n.email IS NOT NULL), '{}'::TEXT[])
  INTO v_ids, v_emails
  FROM public._perf_notice_people(p_include_hr) AS n;

  INSERT INTO public.performance_email_outbox (
    notice_key, kind, subject, line, recipient_emails, recipient_ids
  ) VALUES (
    p_notice_key, p_kind, p_subject, p_line, COALESCE(v_emails, '{}'), COALESCE(v_ids, '{}')
  )
  ON CONFLICT (notice_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

-- One in-app notice plus one outbox row per new probationary evaluation.
CREATE OR REPLACE FUNCTION public._perf_announce_created(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_lines TEXT[] := ARRAY[]::TEXT[];
  v_ids UUID[] := ARRAY[]::UUID[];
  v_subject TEXT := 'Probationary evaluations created';
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;

  FOR v_rec IN
    SELECT pe.id, pe.period_label, pe.due_date,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           e.employee_code
    FROM public.performance_evaluations pe
    JOIN public.employees e ON e.id = pe.employee_id
    JOIN public.performance_form_templates t ON t.id = pe.template_id
    WHERE pe.id = ANY (p_ids)
      AND t.schedule_type = 'hired_offset'
  LOOP
    IF public._perf_enqueue_notice(
      'created',
      'created:' || v_rec.id::TEXT,
      v_subject,
      format('%s (%s) — %s, due %s',
        v_rec.employee_name,
        COALESCE(v_rec.employee_code, '—'),
        v_rec.period_label,
        to_char(v_rec.due_date, 'Mon DD, YYYY')),
      FALSE
    ) THEN
      v_lines := v_lines || format('%s (%s) — %s, due %s',
        v_rec.employee_name,
        COALESCE(v_rec.employee_code, '—'),
        v_rec.period_label,
        to_char(v_rec.due_date, 'Mon DD, YYYY'));
      v_ids := v_ids || v_rec.id;
    END IF;
  END LOOP;

  IF cardinality(v_lines) = 0 THEN
    RETURN;
  END IF;

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT n.user_id FROM public._perf_notice_people(FALSE) AS n),
    'performance',
    v_subject,
    array_to_string(v_lines, E'\n'),
    '/dashboard/performance',
    jsonb_build_object('kind', 'created', 'evaluation_ids', to_jsonb(v_ids)),
    FALSE
  );
END;
$$;

-- One reminder, reminder_days_before the due date, only when nobody created it.
CREATE OR REPLACE FUNCTION public._perf_remind_needs_create(p_today DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INT;
  v_go_live DATE;
  v_rec RECORD;
  v_lines TEXT[] := ARRAY[]::TEXT[];
  v_subject TEXT := 'Create probationary evaluations';
  v_count INTEGER := 0;
BEGIN
  SELECT COALESCE(reminder_days_before, 7), go_live_date
  INTO v_days, v_go_live
  FROM public.performance_settings
  WHERE id = 1;
  v_days := COALESCE(v_days, 7);

  FOR v_rec IN
    SELECT t.id AS template_id,
           t.name AS template_name,
           e.id AS employee_id,
           e.employee_code,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name,
           m.months,
           (e.hired_date + make_interval(months => m.months))::DATE AS due_date
    FROM public.performance_form_templates t
    CROSS JOIN LATERAL (
      SELECT x.val::INT AS months
      FROM jsonb_array_elements_text(COALESCE(t.schedule_config -> 'months_after_hire', '[]'::jsonb)) AS x(val)
    ) m
    JOIN public.employees e
      ON e.is_active
     AND e.hired_date IS NOT NULL
     AND e.employment_status_id = ANY (t.applies_to_status_ids)
    WHERE t.is_active
      AND NOT t.auto_create
      AND t.schedule_type = 'hired_offset'
      AND (e.hired_date + make_interval(months => m.months))::DATE >= COALESCE(v_go_live, '-infinity'::DATE)
      AND (e.hired_date + make_interval(months => m.months))::DATE = p_today + v_days
      AND NOT EXISTS (
        SELECT 1
        FROM public.performance_evaluations pe
        WHERE pe.template_id = t.id
          AND pe.employee_id = e.id
          AND pe.due_date = (e.hired_date + make_interval(months => m.months))::DATE
      )
  LOOP
    IF public._perf_enqueue_notice(
      'needs_create',
      format('needs:%s:%s:%s', v_rec.template_id, v_rec.employee_id, v_rec.due_date),
      v_subject,
      format('%s (%s) — %s, %s Month, due %s',
        v_rec.employee_name,
        COALESCE(v_rec.employee_code, '—'),
        v_rec.template_name,
        public._perf_ordinal(v_rec.months),
        to_char(v_rec.due_date, 'Mon DD, YYYY')),
      TRUE
    ) THEN
      v_lines := v_lines || format('%s (%s) — %s, %s Month, due %s',
        v_rec.employee_name,
        COALESCE(v_rec.employee_code, '—'),
        v_rec.template_name,
        public._perf_ordinal(v_rec.months),
        to_char(v_rec.due_date, 'Mon DD, YYYY'));
      v_count := v_count + 1;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT n.user_id FROM public._perf_notice_people(TRUE) AS n),
    'performance',
    v_subject,
    'These probationary evaluations are not created yet:' || E'\n' || array_to_string(v_lines, E'\n'),
    '/dashboard/performance',
    jsonb_build_object('kind', 'needs_create'),
    FALSE
  );

  RETURN v_count;
END;
$$;

-- Daily generator: only forms with auto_create. Announces new probationary rows.
CREATE OR REPLACE FUNCTION public._perf_generate(p_today DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_go_live DATE;
  v_tpl public.performance_form_templates;
  v_emp RECORD;
  v_offsets INT[];
  v_m INT;
  v_prev INT;
  v_due DATE;
  v_day INT;
  v_month_start DATE;
  v_month_end DATE;
  v_count INTEGER := 0;
  v_id UUID;
  v_created_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT go_live_date INTO v_go_live FROM public.performance_settings WHERE id = 1;

  FOR v_tpl IN
    SELECT * FROM public.performance_form_templates
    WHERE is_active AND auto_create AND schedule_type <> 'manual'
  LOOP
    IF v_tpl.schedule_type = 'hired_offset' THEN
      SELECT COALESCE(ARRAY(
        SELECT t.val::INT
        FROM jsonb_array_elements_text(COALESCE(v_tpl.schedule_config -> 'months_after_hire', '[]'::jsonb)) AS t(val)
        ORDER BY 1
      ), '{}'::INT[]) INTO v_offsets;

      FOR v_emp IN
        SELECT e.id AS employee_id, e.hired_date
        FROM public.employees e
        WHERE e.is_active
          AND e.hired_date IS NOT NULL
          AND e.employment_status_id = ANY (v_tpl.applies_to_status_ids)
      LOOP
        v_prev := 0;
        FOREACH v_m IN ARRAY v_offsets LOOP
          v_due := (v_emp.hired_date + make_interval(months => v_m))::DATE;
          IF v_due >= v_go_live THEN
            v_id := public._perf_create_evaluation(
              v_tpl,
              v_emp.employee_id,
              v_due,
              public._perf_ordinal(v_m) || ' Month',
              (v_emp.hired_date + make_interval(months => v_prev))::DATE,
              v_due,
              NULL,
              NULL
            );
            IF v_id IS NOT NULL THEN
              v_count := v_count + 1;
              v_created_ids := v_created_ids || v_id;
            END IF;
          END IF;
          v_prev := v_m;
        END LOOP;
      END LOOP;

    ELSIF v_tpl.schedule_type = 'monthly' THEN
      v_day := COALESCE((v_tpl.schedule_config ->> 'day_of_month')::INT, 25);
      v_month_start := date_trunc('month', p_today)::DATE;
      v_month_end := (v_month_start + INTERVAL '1 month')::DATE - 1;
      v_due := v_month_start + (LEAST(GREATEST(v_day, 1), EXTRACT(DAY FROM v_month_end)::INT) - 1);

      IF v_due >= v_go_live THEN
        FOR v_emp IN
          SELECT e.id AS employee_id, e.hired_date
          FROM public.employees e
          WHERE e.is_active
            AND e.employment_status_id = ANY (v_tpl.applies_to_status_ids)
            AND (e.hired_date IS NULL OR e.hired_date <= v_due)
        LOOP
          v_id := public._perf_create_evaluation(
            v_tpl,
            v_emp.employee_id,
            v_due,
            to_char(v_due, 'FMMonth YYYY'),
            v_month_start,
            v_month_end,
            NULL,
            NULL
          );
          IF v_id IS NOT NULL THEN
            v_count := v_count + 1;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.performance_evaluators (evaluation_id, evaluator_id)
  SELECT pe.id, x.evaluator_id
  FROM public.performance_evaluations pe
  CROSS JOIN LATERAL unnest(public._perf_default_evaluators(pe.employee_id)) AS x(evaluator_id)
  WHERE pe.status = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM public.performance_evaluators pv WHERE pv.evaluation_id = pe.id
    )
  ON CONFLICT DO NOTHING;

  PERFORM public._perf_announce_created(v_created_ids);
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.performance_create_evaluation(
  p_template_id UUID,
  p_employee_id UUID,
  p_due_date DATE,
  p_period_label TEXT,
  p_period_from DATE,
  p_period_to DATE,
  p_evaluator_ids UUID[],
  p_hr_signer_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tpl public.performance_form_templates;
  v_emp public.employees;
  v_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can create evaluations';
  END IF;

  SELECT * INTO v_tpl FROM public.performance_form_templates WHERE id = p_template_id;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF NOT v_tpl.is_active THEN
    RAISE EXCEPTION 'This template is inactive';
  END IF;

  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF v_emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT v_emp.is_active THEN
    RAISE EXCEPTION 'Employee is inactive';
  END IF;
  IF v_emp.employment_status_id IS NULL OR NOT (v_emp.employment_status_id = ANY (v_tpl.applies_to_status_ids)) THEN
    RAISE EXCEPTION 'This form is not assigned to the employee''s employment status';
  END IF;

  IF p_hr_signer_ids IS NULL OR cardinality(p_hr_signer_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one HR signer';
  END IF;

  PERFORM public._perf_check_evaluators(p_employee_id, p_evaluator_ids);
  PERFORM public._perf_check_hr_signers(p_hr_signer_ids);

  v_id := public._perf_create_evaluation(
    v_tpl, p_employee_id, p_due_date, p_period_label, p_period_from, p_period_to,
    p_evaluator_ids, p_hr_signer_ids
  );

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'An evaluation of this form already exists for this employee on that due date';
  END IF;

  PERFORM public._perf_announce_created(ARRAY[v_id]);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.performance_run_daily()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::DATE;
  v_created INTEGER;
  v_reminders INTEGER;
  v_needs INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can run the performance schedule';
  END IF;

  v_created := public._perf_generate(v_today);
  v_reminders := public._perf_send_reminders(v_today);
  v_needs := public._perf_remind_needs_create(v_today);

  RETURN jsonb_build_object(
    'run_date', v_today,
    'evaluations_created', v_created,
    'reminders_sent', v_reminders,
    'create_reminders', v_needs
  );
END;
$$;

REVOKE ALL ON FUNCTION public._perf_notice_people(BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_enqueue_notice(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_announce_created(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_remind_needs_create(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_generate(DATE) FROM PUBLIC, anon, authenticated;
