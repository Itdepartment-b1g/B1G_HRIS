-- ============================================================
-- B1G HRIS — Migration: Ensure Leave Balance for Current User
-- RPC to auto-create leave_balances for regular employees who don't have
-- a record for the current year (e.g. new hires mid-year).
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_leave_balance_for_current_user()
RETURNS TABLE (
  employee_id UUID,
  year INT,
  vl_balance NUMERIC(5,2),
  sl_balance NUMERIC(5,2),
  pto_balance NUMERIC(5,2),
  lwop_days_used NUMERIC(5,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID := auth.uid();
  v_curr_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;
  v_is_regular BOOLEAN;
  v_is_active BOOLEAN;
  v_existing RECORD;
BEGIN
  IF v_emp_id IS NULL THEN
    RETURN;
  END IF;

  SELECT e.is_active,
         COALESCE(es.is_regular, true) INTO v_is_active, v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = v_emp_id;

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN;
  END IF;

  -- Only create balances for regular employees
  IF NOT v_is_regular THEN
    -- Return existing row if any (for LWOP days used), else return nothing
    SELECT lb.employee_id, lb.year, lb.vl_balance, lb.sl_balance, lb.pto_balance, lb.lwop_days_used
    INTO v_existing
    FROM leave_balances lb
    WHERE lb.employee_id = v_emp_id AND lb.year = v_curr_year;
    IF FOUND THEN
      employee_id := v_existing.employee_id;
      year := v_existing.year;
      vl_balance := v_existing.vl_balance;
      sl_balance := v_existing.sl_balance;
      pto_balance := v_existing.pto_balance;
      lwop_days_used := v_existing.lwop_days_used;
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  -- Regular employee: ensure leave_balances exists for current year
  INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
  VALUES (v_emp_id, v_curr_year, 15, 15, 7, 0)
  ON CONFLICT (employee_id, year) DO NOTHING;

  -- Return the balance (existing or newly created)
  RETURN QUERY
  SELECT lb.employee_id, lb.year, lb.vl_balance, lb.sl_balance, lb.pto_balance, lb.lwop_days_used
  FROM leave_balances lb
  WHERE lb.employee_id = v_emp_id AND lb.year = v_curr_year;
END;
$$;
