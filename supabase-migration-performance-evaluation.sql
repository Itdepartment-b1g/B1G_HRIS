-- ============================================================
-- B1G HRIS — Performance Evaluation Module
-- Form templates (HR-built), probation 3rd/5th-month schedule,
-- evaluators (immediate superiors), HR signer (HR department),
-- employee acknowledgement, audit trail, reminders.
-- Monthly KPI can reuse templates later (schedule_type = 'monthly').
-- Safe to re-run. Run AFTER the existing migrations
-- (needs employees, positions, departments, employee_departments,
--  employee_supervisors, employment_statuses, user_notifications, is_admin).
-- ============================================================

-- 0. NOTIFICATION TYPE: allow 'performance'
-- ============================================================
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.user_notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%announcement%'
  LOOP
    EXECUTE format('ALTER TABLE public.user_notifications DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.user_notifications
    ADD CONSTRAINT user_notifications_type_check
    CHECK (type IN ('leave', 'business_trip', 'overtime', 'survey', 'announcement', 'policy', 'performance'));
END $$;

-- 1. SETTINGS (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hr_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  -- Schedules are only generated for due dates on/after this date (go-live guard).
  go_live_date DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Manila')::DATE),
  reminder_days_before INT NOT NULL DEFAULT 7 CHECK (reminder_days_before BETWEEN 0 AND 60),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.employees(id) ON DELETE SET NULL
);

INSERT INTO public.performance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.performance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_settings_read" ON public.performance_settings;
CREATE POLICY "perf_settings_read" ON public.performance_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "perf_settings_admin_write" ON public.performance_settings;
CREATE POLICY "perf_settings_admin_write" ON public.performance_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. FORM TEMPLATES (built by HR)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  -- Which employment statuses this form is for (e.g. Probationary, or Regular later)
  applies_to_status_ids UUID[] NOT NULL DEFAULT '{}',
  -- hired_offset: due = hired_date + months_after_hire  (probation 3rd / 5th month)
  -- monthly:      one per month on day_of_month          (Monthly KPI later)
  -- manual:       HR creates each one with a due date
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('hired_offset', 'monthly', 'manual')),
  schedule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  rating_scale JSONB NOT NULL DEFAULT '[]'::jsonb,            -- [{value, label}]
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,                 -- [{id,title,description,required,include_in_average,has_comment}]
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,                -- [{id,title,required}]  e.g. Strengths
  rating_bands JSONB NOT NULL DEFAULT '[]'::jsonb,            -- [{min,label}] applied to rounded average
  recommendation_options JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [] = no recommendation field
  recommendation_required BOOLEAN NOT NULL DEFAULT FALSE,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public._perf_template_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF ROW(NEW.applies_to_status_ids, NEW.schedule_type, NEW.schedule_config, NEW.rating_scale,
         NEW.factors, NEW.sections, NEW.rating_bands, NEW.recommendation_options, NEW.recommendation_required)
     IS DISTINCT FROM
     ROW(OLD.applies_to_status_ids, OLD.schedule_type, OLD.schedule_config, OLD.rating_scale,
         OLD.factors, OLD.sections, OLD.rating_bands, OLD.recommendation_options, OLD.recommendation_required)
  THEN
    NEW.version := OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_perf_template_before_update ON public.performance_form_templates;
CREATE TRIGGER trg_perf_template_before_update
  BEFORE UPDATE ON public.performance_form_templates
  FOR EACH ROW EXECUTE FUNCTION public._perf_template_before_update();

ALTER TABLE public.performance_form_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_templates_admin_all" ON public.performance_form_templates;
CREATE POLICY "perf_templates_admin_all" ON public.performance_form_templates
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. EVALUATIONS (each one keeps a frozen copy of the form it was created with)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.performance_form_templates(id) ON DELETE SET NULL,
  template_version INT NOT NULL DEFAULT 1,
  template_name TEXT NOT NULL,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  period_from DATE,
  period_to DATE,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'submitted', 'acknowledged', 'hr_signed', 'cancelled')),
  form_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,                 -- {factor_id: {rating, comment}}
  section_values JSONB NOT NULL DEFAULT '{}'::jsonb,          -- {section_id: text}
  recommendation TEXT,
  average_score NUMERIC(3,1),
  rating_label TEXT,
  date_of_evaluation DATE,
  submitted_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  employee_comment TEXT,
  acknowledged_at TIMESTAMPTZ,
  hr_signer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  hr_signed_at TIMESTAMPTZ,
  hr_comment TEXT,
  ack_skipped_reason TEXT,
  reopen_count INT NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_eval_employee ON public.performance_evaluations (employee_id);
CREATE INDEX IF NOT EXISTS idx_perf_eval_status_due ON public.performance_evaluations (status, due_date);
CREATE INDEX IF NOT EXISTS idx_perf_eval_hr_signer ON public.performance_evaluations (hr_signer_id);
-- One generated evaluation per template / employee / due date (scheduler is idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS uq_perf_eval_template_employee_due
  ON public.performance_evaluations (template_id, employee_id, due_date)
  WHERE template_id IS NOT NULL;

-- 4. EVALUATORS (one or more immediate superiors per evaluation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_evaluators (
  evaluation_id UUID NOT NULL REFERENCES public.performance_evaluations(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, evaluator_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_evaluators_evaluator ON public.performance_evaluators (evaluator_id);

-- 5. AUDIT TRAIL
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_evaluation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES public.performance_evaluations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_events_eval ON public.performance_evaluation_events (evaluation_id, created_at);

-- 6. REMINDER DEDUPE (so each reminder is sent once per day/kind)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_reminders_sent (
  evaluation_id UUID NOT NULL REFERENCES public.performance_evaluations(id) ON DELETE CASCADE,
  reminder_kind TEXT NOT NULL CHECK (reminder_kind IN ('before', 'due', 'overdue')),
  reminder_date DATE NOT NULL,
  PRIMARY KEY (evaluation_id, reminder_kind, reminder_date)
);

ALTER TABLE public.performance_reminders_sent ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER functions touch this table.

-- 7. RLS FOR EVALUATIONS / EVALUATORS / EVENTS
-- Who can see an evaluation: admin, the employee, an assigned evaluator, the HR signer.
-- All writes go through the RPCs below (no direct insert/update policies).
-- ============================================================
CREATE OR REPLACE FUNCTION public._perf_can_view(p_evaluation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.performance_evaluations pe
    WHERE pe.id = p_evaluation_id
      AND (
        public.is_admin(auth.uid())
        OR pe.employee_id = auth.uid()
        OR pe.hr_signer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.performance_evaluators pv
          WHERE pv.evaluation_id = pe.id AND pv.evaluator_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public._perf_can_view(UUID) TO authenticated;

ALTER TABLE public.performance_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_evaluation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perf_eval_select" ON public.performance_evaluations;
CREATE POLICY "perf_eval_select" ON public.performance_evaluations
  FOR SELECT TO authenticated
  USING (public._perf_can_view(id));

DROP POLICY IF EXISTS "perf_evaluators_select" ON public.performance_evaluators;
CREATE POLICY "perf_evaluators_select" ON public.performance_evaluators
  FOR SELECT TO authenticated
  USING (public._perf_can_view(evaluation_id));

DROP POLICY IF EXISTS "perf_events_select" ON public.performance_evaluation_events;
CREATE POLICY "perf_events_select" ON public.performance_evaluation_events
  FOR SELECT TO authenticated
  USING (public._perf_can_view(evaluation_id));

-- ============================================================
-- 8. INTERNAL HELPERS (not callable from the browser)
-- ============================================================
CREATE OR REPLACE FUNCTION public._perf_ordinal(n INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT n::TEXT || CASE
    WHEN n % 100 BETWEEN 11 AND 13 THEN 'th'
    WHEN n % 10 = 1 THEN 'st'
    WHEN n % 10 = 2 THEN 'nd'
    WHEN n % 10 = 3 THEN 'rd'
    ELSE 'th'
  END;
$$;

-- Snapshot of employee header info, frozen onto each evaluation
CREATE OR REPLACE FUNCTION public._perf_employee_snapshot(p_employee_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'employee_code', e.employee_code,
    'full_name', CONCAT_WS(' ', e.first_name, e.last_name),
    'position', COALESCE(p.name, e.position),
    'department', COALESCE(
      (SELECT d.name FROM public.departments d WHERE d.id = e.department_id),
      (SELECT d.name
         FROM public.employee_departments ed
         JOIN public.departments d ON d.id = ed.department_id
        WHERE ed.employee_id = e.id
        ORDER BY d.name
        LIMIT 1)
    ),
    'employment_status', es.name,
    'date_hired', e.hired_date
  )
  FROM public.employees e
  LEFT JOIN public.positions p ON p.id = e.position_id
  LEFT JOIN public.employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = p_employee_id;
$$;

-- Default evaluators = the employee's active immediate superiors
CREATE OR REPLACE FUNCTION public._perf_default_evaluators(p_employee_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT s.id), '{}'::UUID[])
  FROM (
    SELECT es.supervisor_id AS sid
    FROM public.employee_supervisors es
    WHERE es.employee_id = p_employee_id
    UNION
    SELECT e.supervisor_id
    FROM public.employees e
    WHERE e.id = p_employee_id AND e.supervisor_id IS NOT NULL
  ) x
  JOIN public.employees s ON s.id = x.sid AND s.is_active;
$$;

CREATE OR REPLACE FUNCTION public._perf_check_evaluators(p_employee_id UUID, p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_ids) AS x
    WHERE x IS NULL OR NOT (x = ANY (public._perf_default_evaluators(p_employee_id)))
  ) THEN
    RAISE EXCEPTION 'Evaluators must be active immediate superiors of this employee';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._perf_check_hr_signer(p_signer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hr_dept UUID;
BEGIN
  IF p_signer_id IS NULL THEN
    RETURN;
  END IF;

  SELECT hr_department_id INTO v_hr_dept FROM public.performance_settings WHERE id = 1;
  IF v_hr_dept IS NULL THEN
    RAISE EXCEPTION 'Set the Human Resources department in Performance settings first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employee_departments ed
    JOIN public.employees e ON e.id = ed.employee_id
    WHERE ed.employee_id = p_signer_id
      AND ed.department_id = v_hr_dept
      AND e.is_active
  ) THEN
    RAISE EXCEPTION 'HR signer must be an active employee in the Human Resources department';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._perf_log(p_evaluation_id UUID, p_action TEXT, p_details JSONB DEFAULT '{}'::jsonb)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.performance_evaluation_events (evaluation_id, actor_id, action, details)
  VALUES (p_evaluation_id, auth.uid(), p_action, COALESCE(p_details, '{}'::jsonb));
$$;

-- Creates one evaluation with a frozen form snapshot. Returns NULL if it already exists.
CREATE OR REPLACE FUNCTION public._perf_create_evaluation(
  p_template public.performance_form_templates,
  p_employee_id UUID,
  p_due_date DATE,
  p_period_label TEXT,
  p_period_from DATE,
  p_period_to DATE,
  p_evaluator_ids UUID[],
  p_hr_signer_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_evaluators UUID[];
BEGIN
  IF p_evaluator_ids IS NULL OR cardinality(p_evaluator_ids) = 0 THEN
    v_evaluators := public._perf_default_evaluators(p_employee_id);
  ELSE
    v_evaluators := p_evaluator_ids;
  END IF;

  INSERT INTO public.performance_evaluations (
    template_id, template_version, template_name, employee_id, period_label,
    period_from, period_to, due_date, status, form_snapshot, hr_signer_id, created_by
  ) VALUES (
    p_template.id, p_template.version, p_template.name, p_employee_id, p_period_label,
    p_period_from, p_period_to, p_due_date, 'scheduled',
    jsonb_build_object(
      'employee', public._perf_employee_snapshot(p_employee_id),
      'rating_scale', p_template.rating_scale,
      'factors', p_template.factors,
      'sections', p_template.sections,
      'rating_bands', p_template.rating_bands,
      'recommendation_options', p_template.recommendation_options,
      'recommendation_required', p_template.recommendation_required
    ),
    p_hr_signer_id,
    auth.uid()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.performance_evaluators (evaluation_id, evaluator_id)
  SELECT DISTINCT v_id, x FROM unnest(v_evaluators) AS x WHERE x IS NOT NULL
  ON CONFLICT DO NOTHING;

  PERFORM public._perf_log(v_id, 'created', jsonb_build_object(
    'template', p_template.name,
    'template_version', p_template.version,
    'due_date', p_due_date
  ));

  RETURN v_id;
END;
$$;

-- Daily generator for hired_offset (probation) and monthly templates
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
BEGIN
  SELECT go_live_date INTO v_go_live FROM public.performance_settings WHERE id = 1;

  FOR v_tpl IN
    SELECT * FROM public.performance_form_templates
    WHERE is_active AND schedule_type <> 'manual'
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

  -- Fill evaluators for scheduled evaluations that still have none
  -- (e.g. a superior was assigned after the evaluation was created)
  INSERT INTO public.performance_evaluators (evaluation_id, evaluator_id)
  SELECT pe.id, x.evaluator_id
  FROM public.performance_evaluations pe
  CROSS JOIN LATERAL unnest(public._perf_default_evaluators(pe.employee_id)) AS x(evaluator_id)
  WHERE pe.status = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM public.performance_evaluators pv WHERE pv.evaluation_id = pe.id
    )
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$;

-- Reminders: evaluators get before / due / overdue; admins also get overdue
CREATE OR REPLACE FUNCTION public._perf_send_reminders(p_today DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days INT;
  v_rec RECORD;
  v_kind TEXT;
  v_recipients UUID[];
  v_title TEXT;
  v_message TEXT;
  v_inserted INT;
  v_count INTEGER := 0;
BEGIN
  SELECT COALESCE(reminder_days_before, 7) INTO v_days FROM public.performance_settings WHERE id = 1;
  v_days := COALESCE(v_days, 7);

  FOR v_rec IN
    SELECT pe.id, pe.due_date, pe.period_label,
           CONCAT_WS(' ', e.first_name, e.last_name) AS employee_name
    FROM public.performance_evaluations pe
    JOIN public.employees e ON e.id = pe.employee_id
    WHERE pe.status = 'scheduled'
      AND (pe.due_date = p_today + v_days OR pe.due_date <= p_today)
  LOOP
    v_kind := CASE
      WHEN v_rec.due_date = p_today + v_days THEN 'before'
      WHEN v_rec.due_date = p_today THEN 'due'
      ELSE 'overdue'
    END;

    INSERT INTO public.performance_reminders_sent (evaluation_id, reminder_kind, reminder_date)
    VALUES (v_rec.id, v_kind, p_today)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    IF v_inserted = 0 THEN
      CONTINUE;
    END IF;

    SELECT ARRAY(
      SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = v_rec.id
    ) INTO v_recipients;

    IF v_kind = 'overdue' THEN
      v_recipients := v_recipients || ARRAY(
        SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('admin', 'super_admin')
      );
    END IF;

    v_title := CASE v_kind
      WHEN 'before' THEN 'Evaluation due soon'
      WHEN 'due' THEN 'Evaluation due today'
      ELSE 'Evaluation overdue'
    END;

    v_message := CASE v_kind
      WHEN 'before' THEN format('%s evaluation for %s is due on %s.',
        v_rec.period_label, v_rec.employee_name, to_char(v_rec.due_date, 'Mon DD, YYYY'))
      WHEN 'due' THEN format('%s evaluation for %s is due today.',
        v_rec.period_label, v_rec.employee_name)
      ELSE format('%s evaluation for %s was due on %s and is not yet submitted.',
        v_rec.period_label, v_rec.employee_name, to_char(v_rec.due_date, 'Mon DD, YYYY'))
    END;

    PERFORM public._insert_user_notifications(
      v_recipients,
      'performance',
      v_title,
      v_message,
      '/dashboard/performance/evaluations/' || v_rec.id::TEXT,
      jsonb_build_object('evaluation_id', v_rec.id, 'reminder', v_kind),
      FALSE
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================
-- 9. SCHEDULER ENTRY POINT (pg_cron calls this daily; admins can run it on demand)
-- ============================================================
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
BEGIN
  -- pg_cron runs with no user (auth.uid() IS NULL) and is allowed.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can run the performance schedule';
  END IF;

  v_created := public._perf_generate(v_today);
  v_reminders := public._perf_send_reminders(v_today);

  RETURN jsonb_build_object(
    'run_date', v_today,
    'evaluations_created', v_created,
    'reminders_sent', v_reminders
  );
END;
$$;

-- ============================================================
-- 10. WORKFLOW RPCs (called from the app)
-- ============================================================

-- Admin: create one evaluation by hand (must match the template's employment statuses)
CREATE OR REPLACE FUNCTION public.performance_create_evaluation(
  p_template_id UUID,
  p_employee_id UUID,
  p_due_date DATE,
  p_period_label TEXT,
  p_period_from DATE,
  p_period_to DATE,
  p_evaluator_ids UUID[],
  p_hr_signer_id UUID
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

  PERFORM public._perf_check_evaluators(p_employee_id, p_evaluator_ids);
  PERFORM public._perf_check_hr_signer(p_hr_signer_id);

  v_id := public._perf_create_evaluation(
    v_tpl, p_employee_id, p_due_date, p_period_label, p_period_from, p_period_to,
    p_evaluator_ids, p_hr_signer_id
  );

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'An evaluation of this form already exists for this employee on that due date';
  END IF;

  RETURN v_id;
END;
$$;

-- Admin: change evaluators (only while scheduled) and/or HR signer (until HR signs)
CREATE OR REPLACE FUNCTION public.performance_update_assignments(
  p_evaluation_id UUID,
  p_evaluator_ids UUID[],
  p_hr_signer_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
  v_old UUID[];
  v_added UUID[];
  v_signer_changed BOOLEAN;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can change assignments';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.status IN ('hr_signed', 'cancelled') THEN
    RAISE EXCEPTION 'This evaluation is closed';
  END IF;

  IF v_eval.status = 'scheduled' THEN
    PERFORM public._perf_check_evaluators(v_eval.employee_id, p_evaluator_ids);
    IF p_evaluator_ids IS NULL OR cardinality(p_evaluator_ids) = 0 THEN
      RAISE EXCEPTION 'Select at least one evaluator';
    END IF;

    v_old := ARRAY(SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = p_evaluation_id);

    DELETE FROM public.performance_evaluators WHERE evaluation_id = p_evaluation_id;
    INSERT INTO public.performance_evaluators (evaluation_id, evaluator_id)
    SELECT DISTINCT p_evaluation_id, x FROM unnest(p_evaluator_ids) AS x WHERE x IS NOT NULL;

    v_added := ARRAY(
      SELECT DISTINCT x FROM unnest(p_evaluator_ids) AS x
      WHERE x IS NOT NULL AND NOT (x = ANY (v_old))
    );

    PERFORM public._insert_user_notifications(
      v_added,
      'performance',
      'Evaluation assigned to you',
      format('You have been assigned to evaluate %s (%s).',
        v_eval.period_label,
        (SELECT CONCAT_WS(' ', e.first_name, e.last_name) FROM public.employees e WHERE e.id = v_eval.employee_id)),
      '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
      jsonb_build_object('evaluation_id', p_evaluation_id),
      FALSE
    );
  END IF;

  v_signer_changed := p_hr_signer_id IS DISTINCT FROM v_eval.hr_signer_id;
  IF v_signer_changed THEN
    PERFORM public._perf_check_hr_signer(p_hr_signer_id);
  END IF;

  UPDATE public.performance_evaluations
  SET hr_signer_id = p_hr_signer_id, updated_at = now()
  WHERE id = p_evaluation_id;

  IF v_signer_changed AND p_hr_signer_id IS NOT NULL AND v_eval.status IN ('submitted', 'acknowledged') THEN
    PERFORM public._insert_user_notifications(
      ARRAY[p_hr_signer_id],
      'performance',
      'Evaluation awaiting HR signature',
      format('An evaluation for %s is waiting for your HR signature.',
        (SELECT CONCAT_WS(' ', e.first_name, e.last_name) FROM public.employees e WHERE e.id = v_eval.employee_id)),
      '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
      jsonb_build_object('evaluation_id', p_evaluation_id),
      FALSE
    );
  END IF;

  PERFORM public._perf_log(p_evaluation_id, 'assignments_updated', jsonb_build_object(
    'evaluator_ids', CASE WHEN v_eval.status = 'scheduled' THEN to_jsonb(p_evaluator_ids) ELSE NULL END,
    'hr_signer_id', p_hr_signer_id,
    'previous_hr_signer_id', v_eval.hr_signer_id
  ));
END;
$$;

-- Evaluator: submit ratings. Server validates and computes the average + band.
CREATE OR REPLACE FUNCTION public.performance_submit_evaluation(
  p_evaluation_id UUID,
  p_ratings JSONB,
  p_section_values JSONB,
  p_recommendation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
  v_snap JSONB;
  v_factor JSONB;
  v_section JSONB;
  v_fid TEXT;
  v_rating INT;
  v_sum NUMERIC := 0;
  v_count INT := 0;
  v_avg NUMERIC(3,1);
  v_label TEXT;
  v_scale_values INT[];
  v_options JSONB;
  v_recommendation TEXT := NULLIF(BTRIM(COALESCE(p_recommendation, '')), '');
  v_today DATE := (now() AT TIME ZONE 'Asia/Manila')::DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.performance_evaluators pv
    WHERE pv.evaluation_id = p_evaluation_id AND pv.evaluator_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only an assigned evaluator can submit this evaluation';
  END IF;
  IF v_eval.status <> 'scheduled' THEN
    RAISE EXCEPTION 'This evaluation has already been submitted';
  END IF;

  v_snap := v_eval.form_snapshot;

  SELECT COALESCE(ARRAY(
    SELECT (t.item ->> 'value')::INT
    FROM jsonb_array_elements(COALESCE(v_snap -> 'rating_scale', '[]'::jsonb)) AS t(item)
  ), '{}'::INT[]) INTO v_scale_values;

  FOR v_factor IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_snap -> 'factors', '[]'::jsonb))
  LOOP
    v_fid := v_factor ->> 'id';
    v_rating := NULLIF(((p_ratings -> v_fid) ->> 'rating'), '')::INT;

    IF COALESCE((v_factor ->> 'required')::BOOLEAN, TRUE) AND v_rating IS NULL THEN
      RAISE EXCEPTION 'Please rate: %', v_factor ->> 'title';
    END IF;

    IF v_rating IS NOT NULL THEN
      IF NOT (v_rating = ANY (v_scale_values)) THEN
        RAISE EXCEPTION 'Invalid rating for: %', v_factor ->> 'title';
      END IF;
      IF COALESCE((v_factor ->> 'include_in_average')::BOOLEAN, TRUE) THEN
        v_sum := v_sum + v_rating;
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Rate at least one factor';
  END IF;

  FOR v_section IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_snap -> 'sections', '[]'::jsonb))
  LOOP
    IF COALESCE((v_section ->> 'required')::BOOLEAN, TRUE)
       AND NULLIF(BTRIM(COALESCE(p_section_values ->> (v_section ->> 'id'), '')), '') IS NULL THEN
      RAISE EXCEPTION 'Please complete: %', v_section ->> 'title';
    END IF;
  END LOOP;

  v_options := COALESCE(v_snap -> 'recommendation_options', '[]'::jsonb);
  IF jsonb_array_length(v_options) > 0 THEN
    IF COALESCE((v_snap ->> 'recommendation_required')::BOOLEAN, FALSE) AND v_recommendation IS NULL THEN
      RAISE EXCEPTION 'Please select a recommendation';
    END IF;
    IF v_recommendation IS NOT NULL AND NOT (v_options @> jsonb_build_array(v_recommendation)) THEN
      RAISE EXCEPTION 'Invalid recommendation';
    END IF;
  END IF;

  v_avg := ROUND(v_sum / v_count, 1);

  SELECT band ->> 'label' INTO v_label
  FROM jsonb_array_elements(COALESCE(v_snap -> 'rating_bands', '[]'::jsonb)) AS t(band)
  WHERE v_avg >= (band ->> 'min')::NUMERIC
  ORDER BY (band ->> 'min')::NUMERIC DESC
  LIMIT 1;

  UPDATE public.performance_evaluations
  SET status = 'submitted',
      ratings = COALESCE(p_ratings, '{}'::jsonb),
      section_values = COALESCE(p_section_values, '{}'::jsonb),
      recommendation = v_recommendation,
      average_score = v_avg,
      rating_label = v_label,
      date_of_evaluation = v_today,
      submitted_by = auth.uid(),
      submitted_at = now(),
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public._perf_log(p_evaluation_id, 'submitted', jsonb_build_object(
    'average_score', v_avg,
    'rating_label', v_label,
    'recommendation', v_recommendation
  ));

  PERFORM public._insert_user_notifications(
    ARRAY[v_eval.employee_id],
    'performance',
    'Performance evaluation available',
    format('Your %s evaluation is ready. Please review and acknowledge it.', v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id),
    FALSE
  );

  RETURN jsonb_build_object('average_score', v_avg, 'rating_label', v_label);
END;
$$;

-- Employee: acknowledge receipt (not agreement). Comment is optional.
CREATE OR REPLACE FUNCTION public.performance_acknowledge(
  p_evaluation_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.employee_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the employee can acknowledge this evaluation';
  END IF;
  IF v_eval.status <> 'submitted' THEN
    RAISE EXCEPTION 'This evaluation is not waiting for acknowledgement';
  END IF;

  UPDATE public.performance_evaluations
  SET status = 'acknowledged',
      acknowledged_at = now(),
      employee_comment = NULLIF(BTRIM(COALESCE(p_comment, '')), ''),
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public._perf_log(p_evaluation_id, 'acknowledged', jsonb_build_object('has_comment', NULLIF(BTRIM(COALESCE(p_comment, '')), '') IS NOT NULL));

  SELECT CONCAT_WS(' ', e.first_name, e.last_name) INTO v_name FROM public.employees e WHERE e.id = v_eval.employee_id;

  IF v_eval.hr_signer_id IS NOT NULL THEN
    PERFORM public._insert_user_notifications(
      ARRAY[v_eval.hr_signer_id], 'performance',
      'Evaluation awaiting HR signature',
      format('%s acknowledged the %s evaluation. Please sign as HR.', v_name, v_eval.period_label),
      '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
      jsonb_build_object('evaluation_id', p_evaluation_id), FALSE
    );
  END IF;

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = p_evaluation_id),
    'performance',
    'Evaluation acknowledged',
    format('%s acknowledged the %s evaluation.', v_name, v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id), FALSE
  );
END;
$$;

-- HR signer: final signature. Normally after employee acknowledgement.
-- If the employee has not acknowledged, a reason is required and is recorded.
CREATE OR REPLACE FUNCTION public.performance_hr_sign(
  p_evaluation_id UUID,
  p_comment TEXT DEFAULT NULL,
  p_skip_ack_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
  v_skip_reason TEXT := NULLIF(BTRIM(COALESCE(p_skip_ack_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.hr_signer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the selected HR signer can sign this evaluation';
  END IF;

  IF v_eval.status = 'acknowledged' THEN
    v_skip_reason := NULL;
  ELSIF v_eval.status = 'submitted' THEN
    IF v_skip_reason IS NULL THEN
      RAISE EXCEPTION 'The employee has not acknowledged yet. Enter a reason to sign without acknowledgement.';
    END IF;
  ELSE
    RAISE EXCEPTION 'This evaluation is not ready for HR signature';
  END IF;

  UPDATE public.performance_evaluations
  SET status = 'hr_signed',
      hr_signed_at = now(),
      hr_comment = NULLIF(BTRIM(COALESCE(p_comment, '')), ''),
      ack_skipped_reason = v_skip_reason,
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public._perf_log(p_evaluation_id, 'hr_signed', jsonb_build_object(
    'signed_without_acknowledgement', v_skip_reason IS NOT NULL,
    'reason', v_skip_reason
  ));

  PERFORM public._insert_user_notifications(
    ARRAY[v_eval.employee_id] || ARRAY(
      SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = p_evaluation_id
    ),
    'performance',
    'Evaluation signed by HR',
    format('The %s evaluation has been signed by HR.', v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id), FALSE
  );
END;
$$;

-- Admin: cancel an open evaluation (e.g. employee regularized early)
CREATE OR REPLACE FUNCTION public.performance_cancel_evaluation(
  p_evaluation_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can cancel evaluations';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.status IN ('hr_signed', 'cancelled') THEN
    RAISE EXCEPTION 'This evaluation cannot be cancelled';
  END IF;

  UPDATE public.performance_evaluations
  SET status = 'cancelled',
      cancel_reason = BTRIM(p_reason),
      cancelled_at = now(),
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public._perf_log(p_evaluation_id, 'cancelled', jsonb_build_object(
    'reason', BTRIM(p_reason),
    'previous_status', v_eval.status
  ));
END;
$$;

-- Admin: reopen a submitted/acknowledged/signed evaluation for correction.
-- Previous scores and signatures are kept in the audit trail.
CREATE OR REPLACE FUNCTION public.performance_reopen_evaluation(
  p_evaluation_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval public.performance_evaluations;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can reopen evaluations';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required';
  END IF;

  SELECT * INTO v_eval FROM public.performance_evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF v_eval.id IS NULL THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.status NOT IN ('submitted', 'acknowledged', 'hr_signed') THEN
    RAISE EXCEPTION 'Only submitted or signed evaluations can be reopened';
  END IF;

  PERFORM public._perf_log(p_evaluation_id, 'reopened', jsonb_build_object(
    'reason', BTRIM(p_reason),
    'previous_status', v_eval.status,
    'previous_average_score', v_eval.average_score,
    'previous_rating_label', v_eval.rating_label,
    'previous_ratings', v_eval.ratings,
    'previous_recommendation', v_eval.recommendation,
    'previous_submitted_by', v_eval.submitted_by,
    'previous_hr_signed_at', v_eval.hr_signed_at
  ));

  UPDATE public.performance_evaluations
  SET status = 'scheduled',
      reopen_count = reopen_count + 1,
      average_score = NULL,
      rating_label = NULL,
      date_of_evaluation = NULL,
      submitted_by = NULL,
      submitted_at = NULL,
      acknowledged_at = NULL,
      employee_comment = NULL,
      hr_signed_at = NULL,
      hr_comment = NULL,
      ack_skipped_reason = NULL,
      updated_at = now()
  WHERE id = p_evaluation_id;

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = p_evaluation_id)
      || ARRAY[v_eval.employee_id],
    'performance',
    'Evaluation reopened',
    format('The %s evaluation has been reopened for correction.', v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id), FALSE
  );
END;
$$;

-- ============================================================
-- 11. PERMISSIONS
-- ============================================================
REVOKE ALL ON FUNCTION public._perf_ordinal(INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._perf_employee_snapshot(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_default_evaluators(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_check_evaluators(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_check_hr_signer(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_log(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_create_evaluation(public.performance_form_templates, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_generate(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_send_reminders(DATE) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.performance_run_daily() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.performance_run_daily() TO authenticated;

GRANT EXECUTE ON FUNCTION public.performance_create_evaluation(UUID, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_update_assignments(UUID, UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_submit_evaluation(UUID, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_acknowledge(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_hr_sign(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_cancel_evaluation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_reopen_evaluation(UUID, TEXT) TO authenticated;

-- ============================================================
-- 12. DAILY SCHEDULE (pg_cron): 08:05 Manila = 00:05 UTC
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'performance_daily_run';
    PERFORM cron.schedule('performance_daily_run', '5 0 * * *', 'SELECT public.performance_run_daily()');
  ELSE
    RAISE NOTICE 'pg_cron is not enabled. Schedule public.performance_run_daily() once a day.';
  END IF;
END $$;
