-- ============================================================
-- B1G HRIS — Exit clearance / offboarding
-- HR starts a clearance after a resignation letter is received.
-- The checklist is a template: Immediate Superior, plus one section
-- per department. Starting a clearance copies the template, so later
-- template edits do not change a clearance already in progress.
-- On the last working day, department heads and the immediate
-- supervisor are notified to sign only their own items.
-- The employee stays active until every item is signed.
-- Safe to re-run. Run in the Supabase SQL editor.
-- Needs: employees, departments, employment_statuses, company_profile,
--        user_notifications, is_admin, _insert_user_notifications.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Notification type
-- ------------------------------------------------------------
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
    CHECK (type IN (
      'leave', 'business_trip', 'overtime', 'survey',
      'announcement', 'policy', 'performance', 'offboarding'
    ));
END $$;

-- ------------------------------------------------------------
-- 1. Template
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clearance_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_kind TEXT NOT NULL CHECK (section_kind IN ('immediate_superior', 'department')),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clearance_template_section_shape CHECK (
    (section_kind = 'department' AND department_id IS NOT NULL)
    OR (section_kind = 'immediate_superior' AND department_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS clearance_template_one_superior
  ON public.clearance_template_sections (section_kind)
  WHERE section_kind = 'immediate_superior';

CREATE UNIQUE INDEX IF NOT EXISTS clearance_template_one_department
  ON public.clearance_template_sections (department_id)
  WHERE department_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.clearance_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.clearance_template_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clearance_template_items_section
  ON public.clearance_template_items (section_id, sort_order);

-- ------------------------------------------------------------
-- 2. Clearance cases (snapshot + copied checklist)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_clearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  resignation_submitted_on DATE NOT NULL,
  last_working_day DATE NOT NULL,
  acceptance_date DATE NOT NULL,
  reason TEXT,
  daily_monthly_rate TEXT,
  gross_pay TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'cleared', 'cancelled')),
  employee_code TEXT,
  employee_name TEXT NOT NULL,
  position_name TEXT,
  hired_date DATE,
  department_name TEXT,
  employment_status TEXT,
  immediate_head_id UUID,
  immediate_head_name TEXT,
  company_name TEXT,
  previous_employment_status_id UUID,
  resigned_status_applied BOOLEAN NOT NULL DEFAULT FALSE,
  deactivated_directly BOOLEAN NOT NULL DEFAULT FALSE,
  heads_notified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  cancel_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_clearances_one_open
  ON public.employee_clearances (employee_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_employee_clearances_status_day
  ON public.employee_clearances (status, last_working_day);

CREATE TABLE IF NOT EXISTS public.clearance_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clearance_id UUID NOT NULL REFERENCES public.employee_clearances(id) ON DELETE CASCADE,
  section_kind TEXT NOT NULL CHECK (section_kind IN ('immediate_superior', 'department')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_clearance_sections_clearance
  ON public.clearance_sections (clearance_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_clearance_sections_assignee
  ON public.clearance_sections (assignee_id);

CREATE TABLE IF NOT EXISTS public.clearance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.clearance_sections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  remarks TEXT,
  deduction TEXT,
  signature_data TEXT,
  signed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  signed_name TEXT,
  cleared_on DATE,
  added_during_case BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clearance_items_section
  ON public.clearance_items (section_id, sort_order);

-- ------------------------------------------------------------
-- 3. Helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._clearance_today()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Manila')::DATE;
$$;

CREATE OR REPLACE FUNCTION public._clearance_person_name(p_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(btrim(concat_ws(' ', first_name, last_name)), '')
  FROM public.employees
  WHERE id = p_id;
$$;

-- People who sign this section today.
-- Immediate superior: employees.supervisor_id plus employee_supervisors.
-- Department: the current department head.
-- If nobody is assigned, fall back to the person stored when the clearance started.
CREATE OR REPLACE FUNCTION public._clearance_section_signer_ids(p_section_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_department_id UUID;
  v_assignee UUID;
  v_employee_id UUID;
  v_ids UUID[];
BEGIN
  SELECT s.section_kind, s.department_id, s.assignee_id, c.employee_id
    INTO v_kind, v_department_id, v_assignee, v_employee_id
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = p_section_id;

  IF v_kind IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  IF v_kind = 'immediate_superior' THEN
    SELECT COALESCE(array_agg(DISTINCT q.sid), ARRAY[]::UUID[])
      INTO v_ids
    FROM (
      SELECT e.supervisor_id AS sid
      FROM public.employees e
      WHERE e.id = v_employee_id
        AND e.supervisor_id IS NOT NULL
      UNION
      SELECT es.supervisor_id
      FROM public.employee_supervisors es
      WHERE es.employee_id = v_employee_id
    ) q;
  ELSE
    SELECT COALESCE(array_agg(d.head_id), ARRAY[]::UUID[])
      INTO v_ids
    FROM public.departments d
    WHERE d.id = v_department_id
      AND d.head_id IS NOT NULL;
  END IF;

  IF COALESCE(cardinality(v_ids), 0) = 0 AND v_assignee IS NOT NULL THEN
    v_ids := ARRAY[v_assignee];
  END IF;

  RETURN COALESCE(v_ids, ARRAY[]::UUID[]);
END;
$$;

CREATE OR REPLACE FUNCTION public._clearance_is_section_signer(p_section_id UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user IS NOT NULL
    AND p_user = ANY (public._clearance_section_signer_ids(p_section_id));
$$;

CREATE OR REPLACE FUNCTION public._clearance_section_signer(p_section_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public._clearance_section_signer_ids(p_section_id))[1];
$$;

CREATE OR REPLACE FUNCTION public.clearance_can_view(p_clearance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.employee_clearances c
      WHERE c.id = p_clearance_id
        AND c.employee_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.clearance_sections s
      WHERE s.clearance_id = p_clearance_id
        AND (
          s.assignee_id = auth.uid()
          OR public._clearance_is_section_signer(s.id, auth.uid())
        )
    );
$$;

CREATE OR REPLACE FUNCTION public._clearance_require_admin()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR admins can do that';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._clearance_restore_employee(p_clearance_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.employee_clearances%ROWTYPE;
BEGIN
  SELECT * INTO v_rec
  FROM public.employee_clearances
  WHERE id = p_clearance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_rec.resigned_status_applied THEN
    UPDATE public.employees
    SET employment_status_id = v_rec.previous_employment_status_id
    WHERE id = v_rec.employee_id;
  ELSIF v_rec.deactivated_directly THEN
    UPDATE public.employees
    SET is_active = TRUE
    WHERE id = v_rec.employee_id;
  END IF;

  UPDATE public.employee_clearances
  SET
    status = 'in_progress',
    completed_at = NULL,
    completed_by = NULL,
    resigned_status_applied = FALSE,
    deactivated_directly = FALSE,
    updated_at = now()
  WHERE id = p_clearance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._clearance_try_complete(p_clearance_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.employee_clearances%ROWTYPE;
  v_open INT;
  v_total INT;
  v_prev UUID;
  v_was_active BOOLEAN;
  v_resigned UUID;
BEGIN
  SELECT * INTO v_rec
  FROM public.employee_clearances
  WHERE id = p_clearance_id
  FOR UPDATE;

  IF NOT FOUND OR v_rec.status <> 'in_progress' THEN
    RETURN FALSE;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE i.cleared_on IS NULL),
    COUNT(*)
  INTO v_open, v_total
  FROM public.clearance_items i
  JOIN public.clearance_sections s ON s.id = i.section_id
  WHERE s.clearance_id = p_clearance_id;

  IF v_total = 0 OR v_open > 0 THEN
    RETURN FALSE;
  END IF;

  SELECT e.employment_status_id, COALESCE(e.is_active, TRUE)
    INTO v_prev, v_was_active
  FROM public.employees e
  WHERE e.id = v_rec.employee_id;

  SELECT es.id INTO v_resigned
  FROM public.employment_statuses es
  WHERE es.name ILIKE '%resign%'
    AND es.name NOT ILIKE '%not resign%'
  ORDER BY length(es.name), es.name
  LIMIT 1;

  IF v_resigned IS NOT NULL AND v_prev IS DISTINCT FROM v_resigned THEN
    UPDATE public.employee_clearances
    SET previous_employment_status_id = v_prev,
        resigned_status_applied = TRUE
    WHERE id = p_clearance_id;

    UPDATE public.employees
    SET employment_status_id = v_resigned
    WHERE id = v_rec.employee_id;
  ELSIF v_resigned IS NULL AND v_was_active THEN
    UPDATE public.employee_clearances
    SET deactivated_directly = TRUE
    WHERE id = p_clearance_id;

    UPDATE public.employees
    SET is_active = FALSE
    WHERE id = v_rec.employee_id;
  END IF;

  UPDATE public.employee_clearances
  SET
    status = 'cleared',
    completed_at = now(),
    completed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_clearance_id;

  RETURN TRUE;
END;
$$;

-- Notify current signers who still have an open item.
-- kind = 'due' sends once per person. kind = 'remind' always sends.
CREATE OR REPLACE FUNCTION public._clearance_notify(p_clearance_id UUID, p_kind TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec public.employee_clearances%ROWTYPE;
  v_section RECORD;
  v_signer UUID;
  v_section_signers UUID[];
  v_ids UUID[] := ARRAY[]::UUID[];
  v_admin_ids UUID[] := ARRAY[]::UUID[];
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_count INTEGER := 0;
  v_sent INTEGER;
  v_name TEXT;
  v_when TEXT;
BEGIN
  IF p_kind NOT IN ('due', 'remind') THEN
    RAISE EXCEPTION 'Unknown clearance notice';
  END IF;

  SELECT * INTO v_rec
  FROM public.employee_clearances
  WHERE id = p_clearance_id;

  IF NOT FOUND OR v_rec.status <> 'in_progress' THEN
    RETURN 0;
  END IF;

  IF v_rec.last_working_day > public._clearance_today() THEN
    RETURN 0;
  END IF;

  FOR v_section IN
    SELECT s.id, s.title
    FROM public.clearance_sections s
    WHERE s.clearance_id = p_clearance_id
      AND EXISTS (
        SELECT 1 FROM public.clearance_items i
        WHERE i.section_id = s.id AND i.cleared_on IS NULL
      )
    ORDER BY s.sort_order, s.title
  LOOP
    v_section_signers := public._clearance_section_signer_ids(v_section.id);
    IF COALESCE(cardinality(v_section_signers), 0) = 0 THEN
      v_missing := array_append(v_missing, v_section.title);
    ELSE
      FOREACH v_signer IN ARRAY v_section_signers
      LOOP
        IF NOT (((v_signer = ANY (v_ids)) IS TRUE)) THEN
          v_ids := array_append(v_ids, v_signer);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  v_name := COALESCE(v_rec.employee_name, 'An employee');
  v_when := to_char(v_rec.last_working_day, 'FMMonth FMDD, YYYY');

  IF p_kind = 'due' AND cardinality(v_ids) > 0 THEN
    SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
      INTO v_ids
    FROM unnest(v_ids) AS u(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_notifications n
      WHERE n.user_id = u.id
        AND n.type = 'offboarding'
        AND n.metadata->>'clearance_id' = p_clearance_id::TEXT
        AND n.metadata->>'kind' = 'due'
    );
  END IF;

  IF cardinality(v_ids) > 0 THEN
    v_sent := public._insert_user_notifications(
      v_ids,
      'offboarding',
      'Exit clearance needed',
      format(
        '%s (Employee No. %s) has a last working day of %s. Sign the exit clearance for your area.',
        v_name,
        COALESCE(NULLIF(btrim(v_rec.employee_code), ''), '—'),
        v_when
      ),
      '/dashboard/offboarding/' || p_clearance_id::TEXT,
      jsonb_build_object('clearance_id', p_clearance_id::TEXT, 'kind', p_kind),
      FALSE
    );
    v_count := v_count + COALESCE(v_sent, 0);
  END IF;

  IF cardinality(v_missing) > 0 THEN
    SELECT COALESCE(array_agg(DISTINCT ur.user_id), ARRAY[]::UUID[])
      INTO v_admin_ids
    FROM public.user_roles ur
    WHERE ur.role IN ('admin', 'super_admin');

    IF p_kind = 'due' AND cardinality(v_admin_ids) > 0 THEN
      SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
        INTO v_admin_ids
      FROM unnest(v_admin_ids) AS u(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.user_notifications n
        WHERE n.user_id = u.id
          AND n.type = 'offboarding'
          AND n.metadata->>'clearance_id' = p_clearance_id::TEXT
          AND n.metadata->>'kind' = 'missing_head'
      );
    END IF;

    IF cardinality(v_admin_ids) > 0 THEN
      v_sent := public._insert_user_notifications(
        v_admin_ids,
        'offboarding',
        'Exit clearance has no department head',
        format(
          '%s still needs a signature from %s, and no department head is assigned. Assign a head or sign that section as HR.',
          v_name,
          array_to_string(v_missing, ', ')
        ),
        '/dashboard/offboarding/' || p_clearance_id::TEXT,
        jsonb_build_object('clearance_id', p_clearance_id::TEXT, 'kind', 'missing_head'),
        FALSE
      );
      v_count := v_count + COALESCE(v_sent, 0);
    END IF;
  END IF;

  IF v_count > 0 OR cardinality(v_ids) > 0 OR p_kind = 'due' THEN
    UPDATE public.employee_clearances
    SET heads_notified_at = COALESCE(heads_notified_at, now()),
        updated_at = now()
    WHERE id = p_clearance_id
      AND last_working_day <= public._clearance_today();
  END IF;

  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- 4. Template sync (also seeds the paper-form checklist)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._clearance_default_labels(p_department_name TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_department_name ILIKE '%human resource%'
     OR p_department_name ILIKE 'hr'
     OR p_department_name ILIKE 'hr %'
     OR p_department_name ILIKE '% hr%'
  THEN
    RETURN ARRAY[
      'Access Badge / Company ID',
      'Health Card',
      'Employee''s Manual',
      'Exit Interview'
    ];
  ELSIF p_department_name ILIKE '%operation%' THEN
    RETURN ARRAY[
      'Mobile Phone Unit',
      'Storage (Sim Card / Memory Card)',
      'Accessories (Charger, Earphone etc.)',
      'Phone Bills (Personal/Unpaid)'
    ];
  ELSE
    RETURN ARRAY['Accountability items'];
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_sync_template_departments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_superior UUID;
  v_added INTEGER := 0;
  v_dept RECORD;
  v_section UUID;
  v_label TEXT;
  v_item_order INT;
  v_sort INT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR admins can update the clearance template';
  END IF;

  SELECT id INTO v_superior
  FROM public.clearance_template_sections
  WHERE section_kind = 'immediate_superior';

  IF v_superior IS NULL THEN
    INSERT INTO public.clearance_template_sections (section_kind, title, sort_order)
    VALUES ('immediate_superior', 'Immediate Superior', 0)
    RETURNING id INTO v_superior;

    INSERT INTO public.clearance_template_items (section_id, label, sort_order)
    VALUES
      (v_superior, 'Resignation Letter', 0),
      (v_superior, 'Checklist of duties for turnover / pending jobs', 1),
      (v_superior, 'Messenger/Viber Group', 2),
      (v_superior, 'Others', 3);
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) INTO v_sort
  FROM public.clearance_template_sections;

  FOR v_dept IN
    SELECT d.id, d.name
    FROM public.departments d
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.clearance_template_sections s
      WHERE s.department_id = d.id
    )
    ORDER BY d.name
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.clearance_template_sections (section_kind, department_id, title, sort_order)
    VALUES ('department', v_dept.id, v_dept.name, v_sort)
    RETURNING id INTO v_section;

    v_item_order := 0;
    FOREACH v_label IN ARRAY public._clearance_default_labels(v_dept.name)
    LOOP
      INSERT INTO public.clearance_template_items (section_id, label, sort_order)
      VALUES (v_section, v_label, v_item_order);
      v_item_order := v_item_order + 1;
    END LOOP;

    v_added := v_added + 1;
  END LOOP;

  RETURN v_added;
END;
$$;

-- ------------------------------------------------------------
-- 5. Case workflow
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clearance_start(
  p_employee_id UUID,
  p_resignation_submitted_on DATE,
  p_last_working_day DATE,
  p_acceptance_date DATE,
  p_reason TEXT DEFAULT NULL,
  p_daily_monthly_rate TEXT DEFAULT NULL,
  p_gross_pay TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp RECORD;
  v_company TEXT;
  v_head_name TEXT;
  v_status_name TEXT;
  v_id UUID;
  v_sec RECORD;
  v_section_id UUID;
  v_assignee UUID;
  v_title TEXT;
  v_items INT;
BEGIN
  PERFORM public._clearance_require_admin();

  IF p_employee_id IS NULL OR p_resignation_submitted_on IS NULL
     OR p_last_working_day IS NULL OR p_acceptance_date IS NULL THEN
    RAISE EXCEPTION 'Employee, resignation letter date, last working day, and acceptance date are required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employee_clearances
    WHERE employee_id = p_employee_id AND status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'This employee already has an exit clearance in progress';
  END IF;

  SELECT COUNT(*) INTO v_items
  FROM public.clearance_template_items;

  IF COALESCE(v_items, 0) = 0 THEN
    RAISE EXCEPTION 'Add at least one checklist item on the clearance template before starting an exit clearance';
  END IF;

  SELECT
    e.id,
    e.employee_code,
    e.first_name,
    e.last_name,
    e.position,
    e.hired_date,
    e.department,
    e.supervisor_id,
    e.employment_status_id
  INTO v_emp
  FROM public.employees e
  WHERE e.id = p_employee_id;

  IF v_emp.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT es.name INTO v_status_name
  FROM public.employment_statuses es
  WHERE es.id = v_emp.employment_status_id;

  v_head_name := public._clearance_person_name(v_emp.supervisor_id);

  SELECT cp.name INTO v_company
  FROM public.company_profile cp
  ORDER BY cp.created_at
  LIMIT 1;

  INSERT INTO public.employee_clearances (
    employee_id,
    created_by,
    resignation_submitted_on,
    last_working_day,
    acceptance_date,
    reason,
    daily_monthly_rate,
    gross_pay,
    employee_code,
    employee_name,
    position_name,
    hired_date,
    department_name,
    employment_status,
    immediate_head_id,
    immediate_head_name,
    company_name
  ) VALUES (
    p_employee_id,
    auth.uid(),
    p_resignation_submitted_on,
    p_last_working_day,
    p_acceptance_date,
    NULLIF(btrim(COALESCE(p_reason, '')), ''),
    NULLIF(btrim(COALESCE(p_daily_monthly_rate, '')), ''),
    NULLIF(btrim(COALESCE(p_gross_pay, '')), ''),
    v_emp.employee_code,
    btrim(concat_ws(' ', v_emp.first_name, v_emp.last_name)),
    NULLIF(btrim(COALESCE(v_emp.position, '')), ''),
    v_emp.hired_date,
    NULLIF(btrim(COALESCE(v_emp.department, '')), ''),
    NULLIF(btrim(COALESCE(v_status_name, '')), ''),
    v_emp.supervisor_id,
    v_head_name,
    COALESCE(NULLIF(btrim(COALESCE(v_company, '')), ''), 'B1G Corporation')
  )
  RETURNING id INTO v_id;

  FOR v_sec IN
    SELECT s.*
    FROM public.clearance_template_sections s
    WHERE EXISTS (
      SELECT 1 FROM public.clearance_template_items i WHERE i.section_id = s.id
    )
    ORDER BY s.sort_order, s.title
  LOOP
    IF v_sec.section_kind = 'immediate_superior' THEN
      v_assignee := v_emp.supervisor_id;
      v_title := v_sec.title;
    ELSE
      SELECT d.head_id INTO v_assignee
      FROM public.departments d
      WHERE d.id = v_sec.department_id;
      v_title := COALESCE(NULLIF(btrim(v_sec.title), ''), 'Department');
    END IF;

    INSERT INTO public.clearance_sections (
      clearance_id, section_kind, department_id, title, assignee_id, sort_order
    ) VALUES (
      v_id, v_sec.section_kind, v_sec.department_id, v_title, v_assignee, v_sec.sort_order
    )
    RETURNING id INTO v_section_id;

    INSERT INTO public.clearance_items (section_id, label, sort_order)
    SELECT v_section_id, i.label, i.sort_order
    FROM public.clearance_template_items i
    WHERE i.section_id = v_sec.id
    ORDER BY i.sort_order, i.created_at;
  END LOOP;

  IF p_last_working_day <= public._clearance_today() THEN
    PERFORM public._clearance_notify(v_id, 'due');
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_update_details(
  p_clearance_id UUID,
  p_resignation_submitted_on DATE,
  p_last_working_day DATE,
  p_acceptance_date DATE,
  p_reason TEXT DEFAULT NULL,
  p_daily_monthly_rate TEXT DEFAULT NULL,
  p_gross_pay TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  PERFORM public._clearance_require_admin();

  IF p_resignation_submitted_on IS NULL OR p_last_working_day IS NULL OR p_acceptance_date IS NULL THEN
    RAISE EXCEPTION 'Resignation letter date, last working day, and acceptance date are required';
  END IF;

  SELECT status INTO v_status
  FROM public.employee_clearances
  WHERE id = p_clearance_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Exit clearance not found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only an in-progress clearance can be edited';
  END IF;

  UPDATE public.employee_clearances
  SET
    resignation_submitted_on = p_resignation_submitted_on,
    last_working_day = p_last_working_day,
    acceptance_date = p_acceptance_date,
    reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
    daily_monthly_rate = NULLIF(btrim(COALESCE(p_daily_monthly_rate, '')), ''),
    gross_pay = NULLIF(btrim(COALESCE(p_gross_pay, '')), ''),
    updated_at = now()
  WHERE id = p_clearance_id;

  IF p_last_working_day <= public._clearance_today() THEN
    PERFORM public._clearance_notify(p_clearance_id, 'due');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_add_item(
  p_section_id UUID,
  p_label TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section public.clearance_sections%ROWTYPE;
  v_status TEXT;
  v_label TEXT;
  v_order INT;
  v_id UUID;
  v_signers UUID[];
  v_name TEXT;
  v_day DATE;
BEGIN
  v_label := NULLIF(btrim(COALESCE(p_label, '')), '');
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'Item name is required';
  END IF;
  IF length(v_label) > 200 THEN
    RAISE EXCEPTION 'Item name must be 200 characters or less';
  END IF;

  SELECT * INTO v_section
  FROM public.clearance_sections
  WHERE id = p_section_id;

  IF v_section.id IS NULL THEN
    RAISE EXCEPTION 'Clearance section not found';
  END IF;

  IF NOT (
    public.is_admin(auth.uid())
    OR public._clearance_is_section_signer(p_section_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'You can only add items to a section you sign';
  END IF;

  SELECT status INTO v_status
  FROM public.employee_clearances
  WHERE id = v_section.clearance_id
  FOR UPDATE;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'This clearance is cancelled';
  END IF;

  IF v_status = 'cleared' THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'This clearance is already complete';
    END IF;
    PERFORM public._clearance_restore_employee(v_section.clearance_id);
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1 INTO v_order
  FROM public.clearance_items
  WHERE section_id = p_section_id;

  INSERT INTO public.clearance_items (section_id, label, sort_order, added_during_case)
  VALUES (p_section_id, v_label, v_order, TRUE)
  RETURNING id INTO v_id;

  SELECT c.employee_name, c.last_working_day
    INTO v_name, v_day
  FROM public.employee_clearances c
  WHERE c.id = v_section.clearance_id;

  v_signers := public._clearance_section_signer_ids(p_section_id);
  IF COALESCE(cardinality(v_signers), 0) > 0 AND v_day IS NOT NULL AND v_day <= public._clearance_today() THEN
    PERFORM public._insert_user_notifications(
      v_signers,
      'offboarding',
      'New exit clearance item',
      format('A new item was added on %s''s exit clearance: %s', COALESCE(v_name, 'an employee'), v_label),
      '/dashboard/offboarding/' || v_section.clearance_id::TEXT,
      jsonb_build_object('clearance_id', v_section.clearance_id::TEXT, 'kind', 'item_added'),
      FALSE
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_delete_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.clearance_items%ROWTYPE;
  v_clearance_id UUID;
  v_status TEXT;
BEGIN
  PERFORM public._clearance_require_admin();

  SELECT * INTO v_item
  FROM public.clearance_items
  WHERE id = p_item_id;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Checklist item not found';
  END IF;
  IF v_item.cleared_on IS NOT NULL THEN
    RAISE EXCEPTION 'Remove the signature before deleting this item';
  END IF;

  SELECT s.clearance_id, c.status
    INTO v_clearance_id, v_status
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = v_item.section_id
  FOR UPDATE OF c;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only an in-progress clearance can be changed';
  END IF;

  DELETE FROM public.clearance_items WHERE id = p_item_id;
  PERFORM public._clearance_try_complete(v_clearance_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_sign_item(
  p_item_id UUID,
  p_remarks TEXT,
  p_deduction TEXT,
  p_signature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.clearance_items%ROWTYPE;
  v_clearance_id UUID;
  v_status TEXT;
  v_remarks TEXT;
  v_deduction TEXT;
BEGIN
  v_remarks := NULLIF(btrim(COALESCE(p_remarks, '')), '');
  v_deduction := NULLIF(btrim(COALESCE(p_deduction, '')), '');

  IF v_remarks IS NOT NULL AND length(v_remarks) > 1000 THEN
    RAISE EXCEPTION 'Remarks must be 1000 characters or less';
  END IF;
  IF v_deduction IS NOT NULL AND length(v_deduction) > 80 THEN
    RAISE EXCEPTION 'Deduction must be 80 characters or less';
  END IF;
  IF p_signature IS NULL OR p_signature NOT LIKE 'data:image/png%' OR length(p_signature) < 80 THEN
    RAISE EXCEPTION 'Draw your signature before clearing this item';
  END IF;
  IF length(p_signature) > 500000 THEN
    RAISE EXCEPTION 'Signature is too large';
  END IF;

  SELECT * INTO v_item
  FROM public.clearance_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Checklist item not found';
  END IF;
  IF v_item.cleared_on IS NOT NULL THEN
    RAISE EXCEPTION 'This item is already cleared';
  END IF;

  IF NOT (
    public.is_admin(auth.uid())
    OR public._clearance_is_section_signer(v_item.section_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'You can only sign items for your own section';
  END IF;

  SELECT s.clearance_id, c.status
    INTO v_clearance_id, v_status
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = v_item.section_id
  FOR UPDATE OF c;

  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'This clearance is not open for signatures';
  END IF;

  UPDATE public.clearance_items
  SET
    remarks = v_remarks,
    deduction = v_deduction,
    signature_data = p_signature,
    signed_by = auth.uid(),
    signed_name = COALESCE(public._clearance_person_name(auth.uid()), 'Signed'),
    cleared_on = public._clearance_today()
  WHERE id = p_item_id;

  RETURN public._clearance_try_complete(v_clearance_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_unsign_item(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.clearance_items%ROWTYPE;
  v_clearance_id UUID;
  v_status TEXT;
BEGIN
  SELECT * INTO v_item
  FROM public.clearance_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Checklist item not found';
  END IF;
  IF v_item.cleared_on IS NULL THEN
    RAISE EXCEPTION 'This item is not signed yet';
  END IF;

  IF NOT (
    public.is_admin(auth.uid())
    OR v_item.signed_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the person who signed this item, or HR, can remove the signature';
  END IF;

  SELECT s.clearance_id, c.status
    INTO v_clearance_id, v_status
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = v_item.section_id
  FOR UPDATE OF c;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'This clearance is cancelled';
  END IF;

  IF v_status = 'cleared' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR can reopen a completed clearance';
  END IF;

  IF v_status = 'cleared' THEN
    PERFORM public._clearance_restore_employee(v_clearance_id);
  END IF;

  UPDATE public.clearance_items
  SET
    remarks = NULL,
    deduction = NULL,
    signature_data = NULL,
    signed_by = NULL,
    signed_name = NULL,
    cleared_on = NULL
  WHERE id = p_item_id;

  UPDATE public.employee_clearances
  SET updated_at = now()
  WHERE id = v_clearance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_cancel(
  p_clearance_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_note TEXT;
BEGIN
  PERFORM public._clearance_require_admin();
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Note must be 1000 characters or less';
  END IF;

  SELECT status INTO v_status
  FROM public.employee_clearances
  WHERE id = p_clearance_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Exit clearance not found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only an in-progress clearance can be cancelled';
  END IF;

  UPDATE public.employee_clearances
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancel_note = v_note,
    updated_at = now()
  WHERE id = p_clearance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_remind(p_clearance_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE;
  v_status TEXT;
BEGIN
  PERFORM public._clearance_require_admin();

  SELECT status, last_working_day INTO v_status, v_day
  FROM public.employee_clearances
  WHERE id = p_clearance_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Exit clearance not found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'This clearance is not waiting for signatures';
  END IF;
  IF v_day > public._clearance_today() THEN
    RAISE EXCEPTION 'Department heads are notified on the last working day';
  END IF;

  RETURN public._clearance_notify(p_clearance_id, 'remind');
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_run_daily()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := public._clearance_today();
  v_id UUID;
  v_cases INTEGER := 0;
  v_notices INTEGER := 0;
  v_sent INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only HR admins can run the clearance schedule';
  END IF;

  FOR v_id IN
    SELECT c.id
    FROM public.employee_clearances c
    WHERE c.status = 'in_progress'
      AND c.last_working_day <= v_today
  LOOP
    v_cases := v_cases + 1;
    v_sent := public._clearance_notify(v_id, 'due');
    v_notices := v_notices + COALESCE(v_sent, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'run_date', v_today,
    'clearances_checked', v_cases,
    'notices_sent', v_notices
  );
END;
$$;

-- ------------------------------------------------------------
-- 6. Permissions and row security
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public._clearance_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_person_name(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_section_signer(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_restore_employee(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_try_complete(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_notify(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_default_labels(TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.clearance_can_view(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_can_view(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_sync_template_departments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_sync_template_departments() TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_start(UUID, DATE, DATE, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_start(UUID, DATE, DATE, DATE, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_update_details(UUID, DATE, DATE, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_update_details(UUID, DATE, DATE, DATE, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_add_item(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_add_item(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_delete_item(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_sign_item(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_sign_item(UUID, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_unsign_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_unsign_item(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_cancel(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_cancel(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_remind(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_remind(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_run_daily() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_run_daily() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clearance_template_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clearance_template_items TO authenticated;
GRANT SELECT ON public.employee_clearances TO authenticated;
GRANT SELECT ON public.clearance_sections TO authenticated;
GRANT SELECT ON public.clearance_items TO authenticated;

ALTER TABLE public.clearance_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_clearances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clearance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clearance_template_sections_read ON public.clearance_template_sections;
CREATE POLICY clearance_template_sections_read
  ON public.clearance_template_sections
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clearance_template_sections_insert ON public.clearance_template_sections;
CREATE POLICY clearance_template_sections_insert
  ON public.clearance_template_sections
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS clearance_template_sections_update ON public.clearance_template_sections;
CREATE POLICY clearance_template_sections_update
  ON public.clearance_template_sections
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS clearance_template_sections_delete ON public.clearance_template_sections;
CREATE POLICY clearance_template_sections_delete
  ON public.clearance_template_sections
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS clearance_template_items_read ON public.clearance_template_items;
CREATE POLICY clearance_template_items_read
  ON public.clearance_template_items
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clearance_template_items_insert ON public.clearance_template_items;
CREATE POLICY clearance_template_items_insert
  ON public.clearance_template_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS clearance_template_items_update ON public.clearance_template_items;
CREATE POLICY clearance_template_items_update
  ON public.clearance_template_items
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS clearance_template_items_delete ON public.clearance_template_items;
CREATE POLICY clearance_template_items_delete
  ON public.clearance_template_items
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS employee_clearances_read ON public.employee_clearances;
CREATE POLICY employee_clearances_read
  ON public.employee_clearances
  FOR SELECT TO authenticated
  USING (public.clearance_can_view(id));

DROP POLICY IF EXISTS clearance_sections_read ON public.clearance_sections;
CREATE POLICY clearance_sections_read
  ON public.clearance_sections
  FOR SELECT TO authenticated
  USING (public.clearance_can_view(clearance_id));

DROP POLICY IF EXISTS clearance_items_read ON public.clearance_items;
CREATE POLICY clearance_items_read
  ON public.clearance_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clearance_sections s
      WHERE s.id = clearance_items.section_id
        AND public.clearance_can_view(s.clearance_id)
    )
  );

-- ------------------------------------------------------------
-- 7. Seed template from current departments
-- ------------------------------------------------------------
SELECT public.clearance_sync_template_departments();

-- ------------------------------------------------------------
-- 8. Daily schedule: 08:10 Asia/Manila (00:10 UTC)
-- Opening Offboarding as HR also runs this, if pg_cron is off.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clearance_daily_run') THEN
      PERFORM cron.unschedule('clearance_daily_run');
    END IF;
    PERFORM cron.schedule(
      'clearance_daily_run',
      '10 0 * * *',
      $cron$SELECT public.clearance_run_daily()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron is not enabled. Schedule public.clearance_run_daily() once a day.';
  END IF;
END $$;
