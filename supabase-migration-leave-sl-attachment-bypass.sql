-- ============================================================
-- B1G HRIS — SL Attachment Bypasses 2-Hour Rule
-- When Sick Leave (same-day) includes an attachment (e.g. medical cert),
-- the 2-hours-before-shift requirement is bypassed.
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_and_submit_leave(
  p_leave_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_leave_duration_type TEXT DEFAULT 'fullday',
  p_reason TEXT DEFAULT NULL,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID := auth.uid();
  v_working_days INT;
  v_num_days NUMERIC(5,2);
  v_day_factor NUMERIC := 1;
  v_balance RECORD;
  v_is_regular BOOLEAN;
  v_shift_start TIME;
  v_weekday TEXT;
  v_submit_ts TIMESTAMPTZ;
  v_new_id UUID;
BEGIN
  IF v_emp_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_start_date > p_end_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'End date must be on or after start date');
  END IF;

  SELECT es.is_regular INTO v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = v_emp_id;
  v_is_regular := COALESCE(v_is_regular, true);

  IF NOT v_is_regular AND p_leave_type != 'lwop' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Probationary employees can only file LWOP');
  END IF;

  IF p_leave_type IN ('vl', 'sl', 'pto') THEN
    v_working_days := count_working_days(p_start_date, p_end_date);
    v_day_factor := CASE p_leave_duration_type
      WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
    END;
    v_num_days := v_working_days * v_day_factor;

    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = v_emp_id AND lb.year = EXTRACT(YEAR FROM p_start_date)::int;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;

    IF p_leave_type = 'vl' AND (COALESCE(v_balance.vl_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient VL balance');
    END IF;
    IF p_leave_type = 'sl' AND (COALESCE(v_balance.sl_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient SL balance');
    END IF;
    IF p_leave_type = 'pto' AND (COALESCE(v_balance.pto_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance');
    END IF;

    IF p_leave_type = 'vl' THEN
      IF (p_start_date - CURRENT_DATE) < 7 THEN
        RETURN jsonb_build_object('success', false, 'error', 'VL must be filed at least 7 days before the leave date');
      END IF;
    END IF;

    -- SL same-day: 2 hours before shift, unless attachment provided (e.g. medical cert)
    IF p_leave_type = 'sl' AND p_start_date = CURRENT_DATE AND (p_attachment_url IS NULL OR trim(p_attachment_url) = '') THEN
      v_weekday := to_char(p_start_date, 'Dy');
      SELECT s.start_time INTO v_shift_start
      FROM employee_shifts es
      JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = v_emp_id
        AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_weekday = ANY(s.days))
      LIMIT 1;
      v_shift_start := COALESCE(v_shift_start, '08:00'::time);
      v_submit_ts := (now() AT TIME ZONE 'Asia/Manila');
      IF v_submit_ts::time > (v_shift_start - interval '2 hours')::time THEN
        RETURN jsonb_build_object('success', false, 'error', 'SL must be filed at least 2 hours before your shift start. Add an attachment (e.g. medical certificate) to bypass this rule.');
      END IF;
    END IF;
  END IF;

  v_working_days := count_working_days(p_start_date, p_end_date);
  v_day_factor := CASE p_leave_duration_type WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1 END;
  v_num_days := v_working_days * v_day_factor;

  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, leave_duration_type, reason, attachment_url, number_of_days, status)
  VALUES (v_emp_id, p_leave_type::leave_type, p_start_date, p_end_date, p_leave_duration_type::leave_duration_type, p_reason, NULLIF(trim(p_attachment_url), ''), v_num_days, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
