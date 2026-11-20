-- ============================================================
-- B1G HRIS — Performance Evaluation v2
-- 1. Multiple HR signers (any one selected HR person can sign)
-- 2. Signature capture for evaluator and HR (PNG data URL)
-- 3. Records who signed as HR (hr_signed_by)
--
-- RUN AFTER supabase-migration-performance-evaluation.sql (v1).
-- Do not re-run v1 after this file.
-- Safe to re-run.
-- ============================================================

-- 1. MULTIPLE HR SIGNERS (replaces performance_evaluations.hr_signer_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_hr_signers (
  evaluation_id UUID NOT NULL REFERENCES public.performance_evaluations(id) ON DELETE CASCADE,
  hr_signer_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (evaluation_id, hr_signer_id)
);

CREATE INDEX IF NOT EXISTS idx_perf_hr_signers_signer ON public.performance_hr_signers (hr_signer_id);

ALTER TABLE public.performance_hr_signers ENABLE ROW LEVEL SECURITY;

-- 2. NEW COLUMNS: who signed as HR, and the two signature images
-- ============================================================
ALTER TABLE public.performance_evaluations
  ADD COLUMN IF NOT EXISTS hr_signed_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS evaluator_signature TEXT,
  ADD COLUMN IF NOT EXISTS hr_signature TEXT;

-- 3. MOVE THE OLD SINGLE HR SIGNER INTO THE NEW TABLE
-- (only runs while the old column still exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'performance_evaluations'
      AND column_name = 'hr_signer_id'
  ) THEN
    INSERT INTO public.performance_hr_signers (evaluation_id, hr_signer_id)
    SELECT id, hr_signer_id
    FROM public.performance_evaluations
    WHERE hr_signer_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    UPDATE public.performance_evaluations
    SET hr_signed_by = hr_signer_id
    WHERE status = 'hr_signed' AND hr_signed_by IS NULL AND hr_signer_id IS NOT NULL;
  END IF;
END $$;

-- 4. ACCESS: admin, employee, evaluator, or any HR signer on the evaluation
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
        OR EXISTS (
          SELECT 1 FROM public.performance_evaluators pv
          WHERE pv.evaluation_id = pe.id AND pv.evaluator_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.performance_hr_signers ph
          WHERE ph.evaluation_id = pe.id AND ph.hr_signer_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public._perf_can_view(UUID) TO authenticated;

DROP POLICY IF EXISTS "perf_hr_signers_select" ON public.performance_hr_signers;
CREATE POLICY "perf_hr_signers_select" ON public.performance_hr_signers
  FOR SELECT TO authenticated
  USING (public._perf_can_view(evaluation_id));

-- 5. INTERNAL CHECKS
-- ============================================================
CREATE OR REPLACE FUNCTION public._perf_check_hr_signers(p_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_ids IS NULL THEN
    RETURN;
  END IF;
  FOR v_id IN SELECT DISTINCT x FROM unnest(p_ids) AS x WHERE x IS NOT NULL LOOP
    PERFORM public._perf_check_hr_signer(v_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._perf_check_signature(p_sig TEXT, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_sig IS NULL OR p_sig NOT LIKE 'data:image/png;base64,%' THEN
    RAISE EXCEPTION 'Please draw your signature before %', p_action;
  END IF;
  IF length(p_sig) > 500000 THEN
    RAISE EXCEPTION 'Signature image is too large. Clear it and sign again.';
  END IF;
END;
$$;

-- 6. CREATE ONE EVALUATION (multiple HR signers)
-- ============================================================
DROP FUNCTION IF EXISTS public._perf_create_evaluation(public.performance_form_templates, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID);

CREATE OR REPLACE FUNCTION public._perf_create_evaluation(
  p_template public.performance_form_templates,
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
    period_from, period_to, due_date, status, form_snapshot, created_by
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

  INSERT INTO public.performance_hr_signers (evaluation_id, hr_signer_id)
  SELECT DISTINCT v_id, x FROM unnest(p_hr_signer_ids) AS x WHERE x IS NOT NULL
  ON CONFLICT DO NOTHING;

  PERFORM public._perf_log(v_id, 'created', jsonb_build_object(
    'template', p_template.name,
    'template_version', p_template.version,
    'due_date', p_due_date
  ));

  RETURN v_id;
END;
$$;

-- 7. ADMIN: CREATE ONE EVALUATION BY HAND
-- ============================================================
DROP FUNCTION IF EXISTS public.performance_create_evaluation(UUID, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID);

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

  RETURN v_id;
END;
$$;

-- 8. ADMIN: CHANGE EVALUATORS AND HR SIGNERS
-- ============================================================
DROP FUNCTION IF EXISTS public.performance_update_assignments(UUID, UUID[], UUID);

CREATE OR REPLACE FUNCTION public.performance_update_assignments(
  p_evaluation_id UUID,
  p_evaluator_ids UUID[],
  p_hr_signer_ids UUID[]
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
  v_old_hr UUID[];
  v_added_hr UUID[];
  v_employee_name TEXT;
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
  IF p_hr_signer_ids IS NULL OR cardinality(p_hr_signer_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one HR signer';
  END IF;

  SELECT CONCAT_WS(' ', e.first_name, e.last_name) INTO v_employee_name
  FROM public.employees e WHERE e.id = v_eval.employee_id;

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
      format('You have been assigned to evaluate %s (%s).', v_eval.period_label, v_employee_name),
      '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
      jsonb_build_object('evaluation_id', p_evaluation_id),
      FALSE
    );
  END IF;

  v_old_hr := ARRAY(SELECT ph.hr_signer_id FROM public.performance_hr_signers ph WHERE ph.evaluation_id = p_evaluation_id);
  v_added_hr := ARRAY(
    SELECT DISTINCT x FROM unnest(p_hr_signer_ids) AS x
    WHERE x IS NOT NULL AND NOT (x = ANY (v_old_hr))
  );
  PERFORM public._perf_check_hr_signers(v_added_hr);

  DELETE FROM public.performance_hr_signers WHERE evaluation_id = p_evaluation_id;
  INSERT INTO public.performance_hr_signers (evaluation_id, hr_signer_id)
  SELECT DISTINCT p_evaluation_id, x FROM unnest(p_hr_signer_ids) AS x WHERE x IS NOT NULL;

  IF cardinality(v_added_hr) > 0 AND v_eval.status IN ('submitted', 'acknowledged') THEN
    PERFORM public._insert_user_notifications(
      v_added_hr,
      'performance',
      'Evaluation awaiting HR signature',
      format('An evaluation for %s is waiting for an HR signature.', v_employee_name),
      '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
      jsonb_build_object('evaluation_id', p_evaluation_id),
      FALSE
    );
  END IF;

  PERFORM public._perf_log(p_evaluation_id, 'assignments_updated', jsonb_build_object(
    'evaluator_ids', CASE WHEN v_eval.status = 'scheduled' THEN to_jsonb(p_evaluator_ids) ELSE NULL END,
    'hr_signer_ids', to_jsonb(p_hr_signer_ids)
  ));
END;
$$;

-- 9. EVALUATOR SUBMIT (now requires the evaluator's signature)
-- ============================================================
DROP FUNCTION IF EXISTS public.performance_submit_evaluation(UUID, JSONB, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.performance_submit_evaluation(
  p_evaluation_id UUID,
  p_ratings JSONB,
  p_section_values JSONB,
  p_recommendation TEXT,
  p_signature TEXT
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

  PERFORM public._perf_check_signature(p_signature, 'submitting');

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
      evaluator_signature = p_signature,
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

-- 10. EMPLOYEE ACKNOWLEDGEMENT (notifies every HR signer)
-- ============================================================
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

  PERFORM public._perf_log(p_evaluation_id, 'acknowledged', jsonb_build_object(
    'has_comment', NULLIF(BTRIM(COALESCE(p_comment, '')), '') IS NOT NULL
  ));

  SELECT CONCAT_WS(' ', e.first_name, e.last_name) INTO v_name
  FROM public.employees e WHERE e.id = v_eval.employee_id;

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT ph.hr_signer_id FROM public.performance_hr_signers ph WHERE ph.evaluation_id = p_evaluation_id),
    'performance',
    'Evaluation awaiting HR signature',
    format('%s acknowledged the %s evaluation. Please sign as HR.', v_name, v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id),
    FALSE
  );

  PERFORM public._insert_user_notifications(
    ARRAY(SELECT pv.evaluator_id FROM public.performance_evaluators pv WHERE pv.evaluation_id = p_evaluation_id),
    'performance',
    'Evaluation acknowledged',
    format('%s acknowledged the %s evaluation.', v_name, v_eval.period_label),
    '/dashboard/performance/evaluations/' || p_evaluation_id::TEXT,
    jsonb_build_object('evaluation_id', p_evaluation_id),
    FALSE
  );
END;
$$;

-- 11. HR SIGN (any selected HR signer; records who signed and the signature)
-- ============================================================
DROP FUNCTION IF EXISTS public.performance_hr_sign(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.performance_hr_sign(
  p_evaluation_id UUID,
  p_comment TEXT DEFAULT NULL,
  p_skip_ack_reason TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL
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
  IF NOT EXISTS (
    SELECT 1 FROM public.performance_hr_signers ph
    WHERE ph.evaluation_id = p_evaluation_id AND ph.hr_signer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only a selected HR signer can sign this evaluation';
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

  PERFORM public._perf_check_signature(p_signature, 'signing as HR');

  UPDATE public.performance_evaluations
  SET status = 'hr_signed',
      hr_signed_at = now(),
      hr_signed_by = auth.uid(),
      hr_signature = p_signature,
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
    jsonb_build_object('evaluation_id', p_evaluation_id),
    FALSE
  );
END;
$$;

-- 12. ADMIN: REOPEN (also clears both signatures so they are signed again)
-- ============================================================
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
    'previous_hr_signed_by', v_eval.hr_signed_by,
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
      evaluator_signature = NULL,
      acknowledged_at = NULL,
      employee_comment = NULL,
      hr_signed_at = NULL,
      hr_signed_by = NULL,
      hr_signature = NULL,
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
    jsonb_build_object('evaluation_id', p_evaluation_id),
    FALSE
  );
END;
$$;

-- 13. DROP THE OLD SINGLE COLUMN (all functions above no longer use it)
-- ============================================================
DROP INDEX IF EXISTS public.idx_perf_eval_hr_signer;
ALTER TABLE public.performance_evaluations DROP COLUMN IF EXISTS hr_signer_id;

-- 14. PERMISSIONS
-- ============================================================
REVOKE ALL ON FUNCTION public._perf_check_hr_signers(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_check_signature(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._perf_create_evaluation(public.performance_form_templates, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.performance_create_evaluation(UUID, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_update_assignments(UUID, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_submit_evaluation(UUID, JSONB, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_hr_sign(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_acknowledge(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.performance_reopen_evaluation(UUID, TEXT) TO authenticated;
