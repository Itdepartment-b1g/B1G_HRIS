-- Substitute signer for one exit-clearance section.
-- Run this in the Supabase SQL editor after supabase-migration-exit-clearance.sql.
--
-- HR can choose another active person in the same department when the usual
-- signer is unavailable. The department head in Master Data is not changed.
-- Clearing the substitute puts the usual signer back.
-- If the last working day has arrived, the new signer gets the same in-app
-- notice and queued email as the morning job, and only if they do not
-- already have one for this clearance.

ALTER TABLE public.clearance_sections
  ADD COLUMN IF NOT EXISTS signer_override_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clearance_sections_signer_override
  ON public.clearance_sections (signer_override_id);

CREATE OR REPLACE FUNCTION public._clearance_employee_in_department(
  p_employee_id UUID,
  p_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_employee_id IS NOT NULL
    AND p_department_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = p_employee_id
        AND COALESCE(e.is_active, TRUE)
        AND (
          e.department_id = p_department_id
          OR EXISTS (
            SELECT 1
            FROM public.employee_departments ed
            WHERE ed.employee_id = e.id
              AND ed.department_id = p_department_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.departments d
            WHERE d.id = p_department_id
              AND d.head_id = e.id
          )
        )
    );
$$;

-- A substitute, when set, is the only signer. Otherwise the usual rules apply.
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
  v_override UUID;
  v_employee_id UUID;
  v_ids UUID[];
BEGIN
  SELECT s.section_kind, s.department_id, s.assignee_id, s.signer_override_id, c.employee_id
    INTO v_kind, v_department_id, v_assignee, v_override, v_employee_id
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = p_section_id;

  IF v_kind IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  IF v_override IS NOT NULL THEN
    RETURN ARRAY[v_override];
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

CREATE OR REPLACE FUNCTION public._clearance_signer_allowed(
  p_section_id UUID,
  p_employee_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_department_id UUID;
  v_subject UUID;
BEGIN
  IF p_employee_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT s.section_kind, s.department_id, c.employee_id
    INTO v_kind, v_department_id, v_subject
  FROM public.clearance_sections s
  JOIN public.employee_clearances c ON c.id = s.clearance_id
  WHERE s.id = p_section_id;

  IF v_kind IS NULL OR p_employee_id = v_subject THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND COALESCE(e.is_active, TRUE)
  ) THEN
    RETURN FALSE;
  END IF;

  IF v_kind = 'immediate_superior' THEN
    RETURN (
      EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.id = v_subject
          AND e.supervisor_id = p_employee_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.employee_supervisors es
        WHERE es.employee_id = v_subject
          AND es.supervisor_id = p_employee_id
      )
      OR EXISTS (
        SELECT 1
        FROM (
          SELECT ed.department_id
          FROM public.employee_departments ed
          WHERE ed.employee_id = v_subject
          UNION
          SELECT e.department_id
          FROM public.employees e
          WHERE e.id = v_subject
            AND e.department_id IS NOT NULL
        ) dept
        WHERE public._clearance_employee_in_department(p_employee_id, dept.department_id)
      )
    );
  END IF;

  RETURN public._clearance_employee_in_department(p_employee_id, v_department_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_section_signer_options(p_section_id UUID)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public._clearance_require_admin();

  IF NOT EXISTS (
    SELECT 1
    FROM public.clearance_sections AS sections
    WHERE sections.id = p_section_id
  ) THEN
    RAISE EXCEPTION 'Clearance section not found';
  END IF;

  RETURN QUERY
  SELECT employees.id, employees.first_name, employees.last_name
  FROM public.employees AS employees
  WHERE public._clearance_signer_allowed(p_section_id, employees.id)
  ORDER BY employees.last_name, employees.first_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.clearance_set_section_signer(
  p_section_id UUID,
  p_employee_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section public.clearance_sections%ROWTYPE;
  v_status TEXT;
  v_name TEXT;
  v_code TEXT;
  v_day DATE;
  v_title TEXT;
  v_when TEXT;
  v_signers UUID[];
  v_pending UUID[];
  v_open BOOLEAN;
BEGIN
  PERFORM public._clearance_require_admin();

  SELECT * INTO v_section
  FROM public.clearance_sections
  WHERE id = p_section_id
  FOR UPDATE;

  IF v_section.id IS NULL THEN
    RAISE EXCEPTION 'Clearance section not found';
  END IF;

  SELECT status, employee_name, employee_code, last_working_day
    INTO v_status, v_name, v_code, v_day
  FROM public.employee_clearances
  WHERE id = v_section.clearance_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Exit clearance not found';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Only an in-progress clearance can change signers';
  END IF;

  IF p_employee_id IS NOT NULL AND NOT public._clearance_signer_allowed(p_section_id, p_employee_id) THEN
    RAISE EXCEPTION 'Choose an active person in this department';
  END IF;

  IF v_section.signer_override_id IS NOT DISTINCT FROM p_employee_id THEN
    RETURN 0;
  END IF;

  UPDATE public.clearance_sections
  SET signer_override_id = p_employee_id
  WHERE id = p_section_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.clearance_items i
    WHERE i.section_id = p_section_id
      AND i.cleared_on IS NULL
  ) INTO v_open;

  IF NOT v_open OR v_day IS NULL OR v_day > public._clearance_today() THEN
    RETURN 0;
  END IF;

  v_signers := public._clearance_section_signer_ids(p_section_id);
  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
    INTO v_pending
  FROM unnest(COALESCE(v_signers, ARRAY[]::UUID[])) AS u(id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_notifications n
    WHERE n.user_id = u.id
      AND n.type = 'offboarding'
      AND n.metadata->>'clearance_id' = v_section.clearance_id::TEXT
      AND n.metadata->>'kind' = 'due'
  );

  IF COALESCE(cardinality(v_pending), 0) = 0 THEN
    RETURN 0;
  END IF;

  v_title := COALESCE(NULLIF(btrim(v_section.title), ''), 'this');
  v_when := to_char(v_day, 'FMMonth FMDD, YYYY');

  RETURN public._insert_user_notifications(
    v_pending,
    'offboarding',
    'Exit clearance needed',
    format(
      '%s (Employee No. %s) has a last working day of %s. You were chosen to sign the %s section.',
      COALESCE(v_name, 'An employee'),
      COALESCE(NULLIF(btrim(v_code), ''), '—'),
      v_when,
      v_title
    ),
    '/dashboard/offboarding/' || v_section.clearance_id::TEXT,
    jsonb_build_object('clearance_id', v_section.clearance_id::TEXT, 'kind', 'due'),
    FALSE
  );
END;
$$;

REVOKE ALL ON FUNCTION public._clearance_employee_in_department(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._clearance_signer_allowed(UUID, UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.clearance_section_signer_options(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_section_signer_options(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.clearance_set_section_signer(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clearance_set_section_signer(UUID, UUID) TO authenticated;
