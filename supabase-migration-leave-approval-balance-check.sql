-- ============================================================
-- B1G HRIS — Migration: Add balance check before leave approval
-- Ensures sufficient VL/SL/PTO balance before approving. Deduction
-- only happens when admin/super_admin/supervisor approves.
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

    FOR v_d IN SELECT d::date FROM generate_series(v_rec.start_date, v_rec.end_date, '1 day'::interval) d
    LOOP
      INSERT INTO attendance_records (employee_id, date, status)
      VALUES (v_rec.employee_id, v_d, 'on_leave')
      ON CONFLICT (employee_id, date) DO UPDATE SET status = 'on_leave', updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
