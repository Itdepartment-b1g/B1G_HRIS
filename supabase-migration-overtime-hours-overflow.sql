-- ============================================================
-- B1G HRIS — Fix OT "numeric field overflow"
-- hours is NUMERIC(4,2) (max 99.99). The RPC assigned a larger value
-- because it subtracted full timestamps (days of minutes) then stuffed
-- that into NUMERIC(4,2). Preview uses clock times (e.g. 3.5h) so submit
-- failed while the dialog looked fine.
--
-- Fix: compute OT from Manila TIME vs shift end (same as the UI),
-- wrap overnight, reject > 24h, widen hours to NUMERIC(6,2).
-- Safe to re-run. Does NOT replace approve_overtime_request.
-- ============================================================

ALTER TABLE public.overtime_requests
  ALTER COLUMN hours TYPE NUMERIC(6,2);

CREATE OR REPLACE FUNCTION public.validate_and_submit_overtime(
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
  v_emp_id UUID := auth.uid();
  v_att RECORD;
  v_shift_end TIME;
  v_end_time TIME;
  v_weekday TEXT;
  v_raw_mins INT;
  v_rounded_mins INT;
  v_ot_hours NUMERIC(6,2);
  v_time_out_local TIMESTAMP;
  v_shift_end_local TIMESTAMP;
  v_new_id UUID;
BEGIN
  IF public.has_role(v_emp_id, 'manager') OR public.has_role(v_emp_id, 'executive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Managers and executives are not eligible for overtime');
  END IF;

  SELECT ar.time_in, ar.time_out, ar.status
  INTO v_att
  FROM attendance_records ar
  WHERE ar.employee_id = v_emp_id AND ar.date = p_ot_date;

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
  WHERE es.employee_id = v_emp_id
    AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_weekday = ANY(s.days))
  ORDER BY s.end_time DESC
  LIMIT 1;

  IF v_shift_end IS NULL THEN
    v_shift_end := '19:00'::time;
  END IF;

  -- Manila wall-clock on both sides (never mix timestamptz with timestamp).
  v_time_out_local := v_att.time_out AT TIME ZONE 'Asia/Manila';
  v_shift_end_local := p_ot_date::timestamp + v_shift_end;
  v_end_time := v_time_out_local::time;

  IF v_time_out_local <= v_shift_end_local THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  -- Same as the File OT preview: clock times, overnight wrap.
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
    WHERE employee_id = v_emp_id
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
    status
  )
  VALUES (
    v_emp_id,
    p_ot_date,
    v_shift_end,
    v_end_time,
    v_ot_hours,
    NULLIF(trim(p_reason), ''),
    NULLIF(trim(p_attachment_url), ''),
    'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
