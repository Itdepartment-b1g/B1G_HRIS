-- ============================================================
-- B1G HRIS — Leave Approval: LWOP=absent, Other=present+auto time_in/out
-- LWOP days → attendance status = absent
-- VL, SL, PTO, CTO, maternity, paternity, etc. → present with auto
-- time_in/time_out from employee's shift (no clock-in/out needed)
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_leave_id UUID,
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
  v_d DATE;
  v_year INT;
  v_balance RECORD;
  v_dow TEXT;
  v_shift RECORD;
  v_time_in TIMESTAMPTZ;
  v_time_out TIMESTAMPTZ;
  v_work_start TIME := '08:00'::time;
  v_work_end TIME := '17:00'::time;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT lr.*, e.employee_code INTO v_rec
  FROM leave_requests lr
  JOIN employees e ON e.id = lr.employee_id
  WHERE lr.id = p_leave_id AND lr.status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leave request not found or not pending');
  END IF;

  -- Only admin, super_admin, or supervisors can approve
  IF NOT (public.is_admin(v_approver_id) OR public.is_supervisor_of(v_approver_id, v_rec.employee_id) OR public.is_approver_of(v_approver_id, v_rec.employee_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  -- For approved VL/SL/PTO: verify sufficient balance before deducting
  IF p_action = 'approved' AND v_rec.leave_type IN ('vl', 'vacation', 'sl', 'sick', 'pto', 'personal') THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;
    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = v_rec.employee_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF v_rec.leave_type IN ('vl', 'vacation') AND COALESCE(v_balance.vl_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient VL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('sl', 'sick') AND COALESCE(v_balance.sl_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient SL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('pto', 'personal') AND COALESCE(v_balance.pto_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance to approve');
    END IF;
  END IF;

  UPDATE leave_requests SET status = p_action::leave_status, approved_by = v_approver_id, approved_at = now() WHERE id = p_leave_id;

  IF p_action = 'approved' THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;
    IF v_rec.leave_type IN ('vl', 'vacation') THEN
      UPDATE leave_balances SET vl_balance = vl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('sl', 'sick') THEN
      UPDATE leave_balances SET sl_balance = sl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('pto', 'personal') THEN
      UPDATE leave_balances SET pto_balance = pto_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type = 'lwop' THEN
      INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
      VALUES (v_rec.employee_id, v_year, 0, 0, 0, COALESCE(v_rec.number_of_days, 0))
      ON CONFLICT (employee_id, year) DO UPDATE SET
        lwop_days_used = leave_balances.lwop_days_used + COALESCE(v_rec.number_of_days, 0),
        updated_at = now();
    END IF;

    -- Get company defaults for fallback when no shift
    SELECT COALESCE(cp.work_start_time, '08:00'::time), COALESCE(cp.work_end_time, '17:00'::time)
    INTO v_work_start, v_work_end
    FROM company_profile cp
    LIMIT 1;

    FOR v_d IN SELECT d::date FROM generate_series(v_rec.start_date, v_rec.end_date, '1 day'::interval) d
    LOOP
      IF v_rec.leave_type = 'lwop' THEN
        -- LWOP: mark as absent
        INSERT INTO attendance_records (employee_id, date, status, minutes_late)
        VALUES (v_rec.employee_id, v_d, 'absent'::attendance_status, 0)
        ON CONFLICT (employee_id, date) DO UPDATE SET
          status = 'absent'::attendance_status,
          minutes_late = 0,
          time_in = NULL,
          time_out = NULL,
          updated_at = now();
      ELSE
        -- Paid leave (VL, SL, PTO, CTO, maternity, paternity, etc.): present + auto time_in/time_out
        -- Use the shift assigned to this employee via employee_shifts; match day-of-week to shift.days
        v_dow := to_char(v_d, 'Dy');
        SELECT s.start_time, s.end_time INTO v_shift
        FROM employee_shifts es
        JOIN shifts s ON s.id = es.shift_id
        WHERE es.employee_id = v_rec.employee_id
          AND s.is_active = true
          AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_dow = ANY(s.days))
        ORDER BY s.start_time
        LIMIT 1;

        IF FOUND THEN
          -- Use the employee's shift start_time and end_time for time_in/time_out
          v_time_in := (v_d || ' ' || v_shift.start_time::text)::timestamp AT TIME ZONE 'Asia/Manila';
          v_time_out := (v_d || ' ' || v_shift.end_time::text)::timestamp AT TIME ZONE 'Asia/Manila';
        ELSE
          v_time_in := (v_d || ' ' || v_work_start::text)::timestamp AT TIME ZONE 'Asia/Manila';
          v_time_out := (v_d || ' ' || v_work_end::text)::timestamp AT TIME ZONE 'Asia/Manila';
        END IF;

        INSERT INTO attendance_records (employee_id, date, time_in, time_out, status, minutes_late)
        VALUES (v_rec.employee_id, v_d, v_time_in, v_time_out, 'present'::attendance_status, 0)
        ON CONFLICT (employee_id, date) DO UPDATE SET
          time_in = EXCLUDED.time_in,
          time_out = EXCLUDED.time_out,
          status = 'present'::attendance_status,
          minutes_late = 0,
          updated_at = now();
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
