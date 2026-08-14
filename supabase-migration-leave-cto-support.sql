-- ============================================================
-- B1G HRIS — CTO Leave Support
-- 1. Add 'cto' to leave_type enum
-- 2. Ensure leave_type_config has CTO
-- 3. Balance check/deduct for config types (cto, maternity, etc.)
--    via leave_balances.balances JSONB
-- Safe to re-run (after enum value exists).
-- ============================================================

-- 1. EXTEND leave_type ENUM
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'cto';

-- 2. Ensure CTO exists in leave_type_config (earned via OT, not annual entitlement)
INSERT INTO public.leave_type_config (code, name, description, annual_entitlement, resets_on_jan1, cap, sort_order, is_system)
SELECT 'cto', 'Compensatory Time Off', 'Time off earned from approved overtime (8 OT hours = 1 CTO day)', 0, false, null, 7, false
WHERE NOT EXISTS (SELECT 1 FROM public.leave_type_config WHERE code = 'cto');

-- Mark paid if pay_type column exists
DO $$
BEGIN
  UPDATE public.leave_type_config SET pay_type = 'paid' WHERE code = 'cto';
EXCEPTION WHEN undefined_column THEN
  NULL;
END $$;

-- Eligibility: regular employment statuses (same pattern as VL/SL/PTO)
DO $$
DECLARE
  v_cto_id UUID;
  v_status RECORD;
BEGIN
  SELECT id INTO v_cto_id FROM public.leave_type_config WHERE code = 'cto' LIMIT 1;
  IF v_cto_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_status IN
    SELECT id FROM public.employment_statuses WHERE COALESCE(is_regular, false) = true
  LOOP
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_cto_id, v_status.id, 'all')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- 3. validate_and_submit_leave — VL/SL/PTO + JSONB types (cto, etc.)
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
  v_json_bal NUMERIC(5,2);
  v_is_regular BOOLEAN;
  v_shift_start TIME;
  v_weekday TEXT;
  v_submit_ts TIMESTAMPTZ;
  v_new_id UUID;
  v_year INT;
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

  v_year := EXTRACT(YEAR FROM p_start_date)::int;
  v_working_days := count_working_days(p_start_date, p_end_date);
  v_day_factor := CASE p_leave_duration_type
    WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
  END;
  v_num_days := v_working_days * v_day_factor;

  IF p_leave_type IN ('vl', 'sl', 'pto') THEN
    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = v_emp_id AND lb.year = v_year;
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

    -- SL same-day: 2 hours before shift, unless attachment provided
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

  ELSIF p_leave_type NOT IN ('lwop', 'vacation', 'sick', 'personal') THEN
    -- Config-driven types (cto, maternity, paternity, custom): balances JSONB
    SELECT COALESCE((lb.balances ->> p_leave_type)::numeric, 0) INTO v_json_bal
    FROM leave_balances lb
    WHERE lb.employee_id = v_emp_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF COALESCE(v_json_bal, 0) < v_num_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient ' || upper(p_leave_type) || ' balance');
    END IF;
  END IF;

  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, leave_duration_type, reason, attachment_url, number_of_days, status)
  VALUES (v_emp_id, p_leave_type::leave_type, p_start_date, p_end_date, p_leave_duration_type::leave_duration_type, p_reason, NULLIF(trim(p_attachment_url), ''), v_num_days, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 4. admin_file_leave_on_behalf — same balance rules, skip notice
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_file_leave_on_behalf(
  p_employee_id UUID,
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
  v_admin_id UUID := auth.uid();
  v_working_days INT;
  v_num_days NUMERIC(5,2);
  v_day_factor NUMERIC := 1;
  v_balance RECORD;
  v_json_bal NUMERIC(5,2);
  v_is_regular BOOLEAN;
  v_new_id UUID;
  v_result JSONB;
  v_year INT;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins can file leave on behalf of employees');
  END IF;

  IF p_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee is required');
  END IF;

  IF p_start_date > p_end_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'End date must be on or after start date');
  END IF;

  SELECT es.is_regular INTO v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = p_employee_id;
  v_is_regular := COALESCE(v_is_regular, true);

  IF NOT v_is_regular AND p_leave_type != 'lwop' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Probationary employees can only file LWOP');
  END IF;

  v_year := EXTRACT(YEAR FROM p_start_date)::int;
  v_working_days := count_working_days(p_start_date, p_end_date);
  v_day_factor := CASE p_leave_duration_type
    WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
  END;
  v_num_days := v_working_days * v_day_factor;

  IF p_leave_type IN ('vl', 'sl', 'pto') THEN
    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = p_employee_id AND lb.year = v_year;
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

  ELSIF p_leave_type NOT IN ('lwop', 'vacation', 'sick', 'personal') THEN
    SELECT COALESCE((lb.balances ->> p_leave_type)::numeric, 0) INTO v_json_bal
    FROM leave_balances lb
    WHERE lb.employee_id = p_employee_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF COALESCE(v_json_bal, 0) < v_num_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient ' || upper(p_leave_type) || ' balance');
    END IF;
  END IF;

  INSERT INTO leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    leave_duration_type,
    reason,
    attachment_url,
    number_of_days,
    status,
    filed_by_admin_id
  )
  VALUES (
    p_employee_id,
    p_leave_type::leave_type,
    p_start_date,
    p_end_date,
    p_leave_duration_type::leave_duration_type,
    p_reason,
    p_attachment_url,
    v_num_days,
    'pending',
    v_admin_id
  )
  RETURNING id INTO v_new_id;

  SELECT public.approve_leave_request(v_new_id, 'approved') INTO v_result;

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Approval failed: %', v_result ->> 'error';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 5. approve_leave_request — deduct JSONB balances for cto/etc.
-- Preserves apply_approved_leave_to_attendance sync pattern.
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
  v_year INT;
  v_balance RECORD;
  v_json_bal NUMERIC(5,2);
  v_leave_code TEXT;
  v_days NUMERIC(5,2);
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT lr.*, e.employee_code INTO v_rec
  FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id
  WHERE lr.id = p_leave_id AND lr.status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leave request not found or not pending');
  END IF;

  IF NOT (public.is_admin(v_approver_id) OR public.is_supervisor_of(v_approver_id, v_rec.employee_id) OR public.is_approver_of(v_approver_id, v_rec.employee_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  v_leave_code := v_rec.leave_type::text;
  v_days := COALESCE(v_rec.number_of_days, 0);
  v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;

  IF p_action = 'approved' AND v_rec.leave_type IN ('vl', 'vacation', 'sl', 'sick', 'pto', 'personal') THEN
    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM public.leave_balances lb
    WHERE lb.employee_id = v_rec.employee_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF v_rec.leave_type IN ('vl', 'vacation') AND COALESCE(v_balance.vl_balance, 0) < v_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient VL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('sl', 'sick') AND COALESCE(v_balance.sl_balance, 0) < v_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient SL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('pto', 'personal') AND COALESCE(v_balance.pto_balance, 0) < v_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance to approve');
    END IF;

  ELSIF p_action = 'approved' AND v_leave_code NOT IN ('lwop') THEN
    SELECT COALESCE((lb.balances ->> v_leave_code)::numeric, 0) INTO v_json_bal
    FROM public.leave_balances lb
    WHERE lb.employee_id = v_rec.employee_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF COALESCE(v_json_bal, 0) < v_days THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient ' || upper(v_leave_code) || ' balance to approve');
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = p_action::public.leave_status, approved_by = v_approver_id, approved_at = now()
  WHERE id = p_leave_id;

  IF p_action = 'approved' THEN
    IF v_rec.leave_type IN ('vl', 'vacation') THEN
      UPDATE public.leave_balances SET vl_balance = vl_balance - v_days, updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('sl', 'sick') THEN
      UPDATE public.leave_balances SET sl_balance = sl_balance - v_days, updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('pto', 'personal') THEN
      UPDATE public.leave_balances SET pto_balance = pto_balance - v_days, updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type = 'lwop' THEN
      INSERT INTO public.leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
      VALUES (v_rec.employee_id, v_year, 0, 0, 0, v_days)
      ON CONFLICT (employee_id, year) DO UPDATE SET
        lwop_days_used = public.leave_balances.lwop_days_used + v_days,
        updated_at = now();
    ELSE
      -- cto, maternity, paternity, and other config types
      UPDATE public.leave_balances
      SET balances = jsonb_set(
            COALESCE(balances, '{}'::jsonb),
            ARRAY[v_leave_code],
            to_jsonb(ROUND((GREATEST(0, COALESCE((balances ->> v_leave_code)::numeric, 0) - v_days))::numeric, 2))
          ),
          updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    END IF;

    -- Prefer helper if present (leave-attendance-connect); ignore if not deployed yet
    BEGIN
      PERFORM public.apply_approved_leave_to_attendance(p_leave_id);
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  ELSE
    BEGIN
      DELETE FROM public.attendance_records WHERE leave_request_id = p_leave_id;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
