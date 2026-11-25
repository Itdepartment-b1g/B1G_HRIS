-- ============================================================
-- B1G HRIS — File Overtime On Behalf
-- Immediate superiors can file for employees under them.
-- Admin / super_admin can file for any employee.
-- Requests are auto-approved (CTO credited via approve_overtime_request).
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.overtime_requests
  ADD COLUMN IF NOT EXISTS filed_by_id UUID REFERENCES public.employees(id);

COMMENT ON COLUMN public.overtime_requests.filed_by_id IS
  'Set when a superior or admin files the OT on behalf of the employee';

CREATE OR REPLACE FUNCTION public.file_overtime_on_behalf(
  p_employee_id UUID,
  p_ot_date DATE,
  p_reason TEXT,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filer_id UUID := auth.uid();
  v_att RECORD;
  v_shift_end TIME;
  v_weekday TEXT;
  v_raw_mins INT;
  v_rounded_mins INT;
  v_end_time TIME;
  v_ot_hours NUMERIC(6,2);
  v_time_out_local TIMESTAMP;
  v_shift_end_local TIMESTAMP;
  v_new_id UUID;
  v_result JSONB;
  v_is_active BOOLEAN;
BEGIN
  IF v_filer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee is required');
  END IF;

  IF p_ot_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT date is required');
  END IF;

  IF NULLIF(trim(p_reason), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason is required');
  END IF;

  SELECT e.is_active INTO v_is_active
  FROM public.employees e
  WHERE e.id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee not found');
  END IF;
  IF COALESCE(v_is_active, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee is inactive');
  END IF;

  IF NOT (
    public.is_admin(v_filer_id)
    OR public.is_supervisor_of(v_filer_id, p_employee_id)
    OR public.is_approver_of(v_filer_id, p_employee_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to file overtime for this employee');
  END IF;

  -- Target employee eligibility (same as self-file)
  IF public.has_role(p_employee_id, 'manager') OR public.has_role(p_employee_id, 'executive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Managers and executives are not eligible for overtime');
  END IF;

  SELECT ar.time_in, ar.time_out, ar.status
  INTO v_att
  FROM attendance_records ar
  WHERE ar.employee_id = p_employee_id AND ar.date = p_ot_date;

  IF NOT FOUND OR v_att.time_in IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No attendance record for this date');
  END IF;

  IF v_att.status = 'absent' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot file OT when absent');
  END IF;

  IF v_att.time_out IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  v_weekday := to_char(p_ot_date, 'Dy');
  SELECT s.end_time INTO v_shift_end
  FROM employee_shifts es
  JOIN shifts s ON s.id = es.shift_id
  WHERE es.employee_id = p_employee_id
    AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_weekday = ANY(s.days))
  ORDER BY s.end_time DESC
  LIMIT 1;

  IF v_shift_end IS NULL THEN
    v_shift_end := '19:00'::time;
  END IF;

  v_time_out_local := v_att.time_out AT TIME ZONE 'Asia/Manila';
  v_shift_end_local := p_ot_date::timestamp + v_shift_end;
  v_end_time := v_time_out_local::time;

  IF v_time_out_local <= v_shift_end_local THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  v_raw_mins := FLOOR(EXTRACT(EPOCH FROM (v_end_time - v_shift_end)) / 60)::int;
  IF v_raw_mins < 0 THEN
    v_raw_mins := v_raw_mins + (24 * 60);
  END IF;

  IF v_raw_mins > (24 * 60) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Overtime cannot exceed 24 hours. Check your time-out record.');
  END IF;

  v_rounded_mins := (v_raw_mins / 30) * 30;

  IF v_rounded_mins < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum overtime is 1 hour');
  END IF;

  v_ot_hours := ROUND((v_rounded_mins / 60.0)::numeric, 2);

  IF EXISTS (
    SELECT 1 FROM overtime_requests
    WHERE employee_id = p_employee_id
      AND date = p_ot_date
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT already filed for this date');
  END IF;

  INSERT INTO overtime_requests (
    employee_id,
    date,
    start_time,
    end_time,
    hours,
    reason,
    attachment_url,
    status,
    filed_by_id
  )
  VALUES (
    p_employee_id,
    p_ot_date,
    v_shift_end,
    v_end_time,
    v_ot_hours,
    NULLIF(trim(p_reason), ''),
    NULLIF(trim(p_attachment_url), ''),
    'pending',
    v_filer_id
  )
  RETURNING id INTO v_new_id;

  SELECT public.approve_overtime_request(v_new_id, 'approved') INTO v_result;

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_result ->> 'error', 'Filed but auto-approve failed')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_new_id, 'hours', v_ot_hours);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.file_overtime_on_behalf(UUID, DATE, TEXT, TEXT) TO authenticated;
