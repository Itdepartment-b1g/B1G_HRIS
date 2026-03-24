-- ============================================================
-- B1G HRIS — Overtime RPC: validate_and_submit_overtime, approve_overtime_request
-- Requires: overtime_requests table, is_approver_of, has_role
-- OT rules: min 1hr, round down to 30-min increments
-- Safe to re-run.
-- ============================================================

-- 1. VALIDATE AND SUBMIT OVERTIME REQUEST
-- ============================================================
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
  v_weekday TEXT;
  v_raw_mins INT;
  v_rounded_mins INT;
  v_ot_hours NUMERIC(4,2);
  v_shift_start_ts TIMESTAMPTZ;
  v_shift_end_ts TIMESTAMPTZ;
  v_new_id UUID;
BEGIN
  -- 1. Eligibility: reject manager and executive
  IF public.has_role(v_emp_id, 'manager') OR public.has_role(v_emp_id, 'executive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Managers and executives are not eligible for overtime');
  END IF;

  -- 2. Fetch attendance for OT date
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

  -- 3. Get shift end_time for this weekday
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

  -- 4. Compute: time_out - (date + shift_end). Reject if time_out <= shift_end
  v_shift_end_ts := (p_ot_date || ' ' || v_shift_end::text)::timestamp AT TIME ZONE 'Asia/Manila';
  IF (v_att.time_out AT TIME ZONE 'Asia/Manila') <= v_shift_end_ts THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  -- 5. Raw OT minutes, round down to 30
  v_raw_mins := EXTRACT(EPOCH FROM ((v_att.time_out AT TIME ZONE 'Asia/Manila') - v_shift_end_ts)) / 60;
  v_rounded_mins := (v_raw_mins::int / 30) * 30;

  IF v_rounded_mins < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum overtime is 1 hour');
  END IF;

  v_ot_hours := v_rounded_mins / 60.0;

  -- 6. No duplicate OT for same date (pending or approved)
  IF EXISTS (
    SELECT 1 FROM overtime_requests
    WHERE employee_id = v_emp_id
      AND date = p_ot_date
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT already filed for this date');
  END IF;

  -- 7. Insert
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
    (v_att.time_out AT TIME ZONE 'Asia/Manila')::time,
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

-- 2. APPROVE/REJECT OVERTIME REQUEST
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_overtime_request(
  p_ot_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_approver_id UUID := auth.uid();
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT * INTO v_rec
  FROM overtime_requests
  WHERE id = p_ot_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT request not found or not pending');
  END IF;

  IF NOT (
    public.is_admin(v_approver_id)
    OR public.is_supervisor_of(v_approver_id, v_rec.employee_id)
    OR public.is_approver_of(v_approver_id, v_rec.employee_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  UPDATE overtime_requests
  SET status = p_action::overtime_status,
      approved_by = v_approver_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_ot_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
