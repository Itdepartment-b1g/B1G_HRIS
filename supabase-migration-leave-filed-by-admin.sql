-- ============================================================
-- B1G HRIS — Migration: Track HR-filed leaves
-- Adds filed_by_admin_id to leave_requests so we can distinguish
-- HR-filed requests from employee self-service ones.
-- Also updates admin_file_leave_on_behalf to populate it.
-- ============================================================

-- 1. Add filed_by_admin_id column (nullable for legacy / self-filed rows)
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS filed_by_admin_id UUID REFERENCES public.employees(id);

-- 2. Update HR RPC to record the admin who filed on behalf
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
  v_is_regular BOOLEAN;
  v_new_id UUID;
  v_result JSONB;
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

  -- Determine if employee is regular (mirrors validate_and_submit_leave)
  SELECT es.is_regular INTO v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = p_employee_id;
  v_is_regular := COALESCE(v_is_regular, true);

  IF NOT v_is_regular AND p_leave_type != 'lwop' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Probationary employees can only file LWOP');
  END IF;

  -- Balance checks: reuse validate_and_submit_leave logic but skip notice rules
  IF p_leave_type IN ('vl', 'sl', 'pto') THEN
    v_working_days := count_working_days(p_start_date, p_end_date);
    v_day_factor := CASE p_leave_duration_type
      WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
    END;
    v_num_days := v_working_days * v_day_factor;

    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = p_employee_id AND lb.year = EXTRACT(YEAR FROM p_start_date)::int;
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
  END IF;

  -- Compute days (including LWOP / other types)
  v_working_days := count_working_days(p_start_date, p_end_date);
  v_day_factor := CASE p_leave_duration_type
    WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
  END;
  v_num_days := v_working_days * v_day_factor;

  -- Insert as pending, recording who filed on behalf, then reuse approve_leave_request
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

  -- Auto-approve as the admin (reuses existing logic for balances + attendance)
  SELECT public.approve_leave_request(v_new_id, 'approved') INTO v_result;

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    -- Roll back the insert if approval failed
    RAISE EXCEPTION 'Approval failed: %', v_result ->> 'error';
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

