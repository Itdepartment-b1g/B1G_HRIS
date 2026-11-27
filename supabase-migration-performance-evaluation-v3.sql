-- ============================================================
-- B1G HRIS — Performance Evaluation v3
-- Automatic evaluations get every active employee in the
-- Human Resources department as an HR signer.
-- Also fills that list on evaluations that were created earlier
-- and still have nobody who can sign as HR.
--
-- RUN AFTER supabase-migration-performance-evaluation-v2.sql.
-- Safe to re-run.
-- ============================================================

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
  v_hr_signers UUID[];
BEGIN
  IF p_evaluator_ids IS NULL OR cardinality(p_evaluator_ids) = 0 THEN
    v_evaluators := public._perf_default_evaluators(p_employee_id);
  ELSE
    v_evaluators := p_evaluator_ids;
  END IF;

  IF p_hr_signer_ids IS NULL OR cardinality(p_hr_signer_ids) = 0 THEN
    SELECT COALESCE(array_agg(e.id), '{}'::UUID[])
    INTO v_hr_signers
    FROM public.performance_settings s
    JOIN public.employee_departments ed ON ed.department_id = s.hr_department_id
    JOIN public.employees e ON e.id = ed.employee_id AND e.is_active
    WHERE s.id = 1
      AND s.hr_department_id IS NOT NULL;
  ELSE
    v_hr_signers := p_hr_signer_ids;
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
  SELECT DISTINCT v_id, x FROM unnest(v_hr_signers) AS x WHERE x IS NOT NULL
  ON CONFLICT DO NOTHING;

  PERFORM public._perf_log(v_id, 'created', jsonb_build_object(
    'template', p_template.name,
    'template_version', p_template.version,
    'due_date', p_due_date
  ));

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public._perf_create_evaluation(public.performance_form_templates, UUID, DATE, TEXT, DATE, DATE, UUID[], UUID[]) FROM PUBLIC, anon, authenticated;

-- Evaluations already created with nobody to sign as HR
INSERT INTO public.performance_hr_signers (evaluation_id, hr_signer_id)
SELECT pe.id, e.id
FROM public.performance_evaluations pe
JOIN public.performance_settings s ON s.id = 1
JOIN public.employee_departments ed ON ed.department_id = s.hr_department_id
JOIN public.employees e ON e.id = ed.employee_id AND e.is_active
WHERE s.hr_department_id IS NOT NULL
  AND pe.status IN ('scheduled', 'submitted', 'acknowledged')
  AND NOT EXISTS (
    SELECT 1 FROM public.performance_hr_signers ph WHERE ph.evaluation_id = pe.id
  )
ON CONFLICT DO NOTHING;
