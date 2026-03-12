-- ============================================================
-- B1G HRIS — Ensure Leave Balance: Use leave_type_config
-- Populates balances JSONB from leave_type_config for eligible employees.
-- Run after supabase-migration-leave-balances-jsonb.sql
-- Safe to re-run.
-- ============================================================

DROP FUNCTION IF EXISTS public.ensure_leave_balance_for_current_user();

CREATE OR REPLACE FUNCTION public.ensure_leave_balance_for_current_user()
RETURNS TABLE (
  employee_id UUID,
  year INT,
  vl_balance NUMERIC(5,2),
  sl_balance NUMERIC(5,2),
  pto_balance NUMERIC(5,2),
  lwop_days_used NUMERIC(5,2),
  balances JSONB
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
  v_employment_status_id UUID;
  v_gender TEXT;
  v_existing RECORD;
  v_balances JSONB := '{}';
  v_config RECORD;
  v_vl NUMERIC(5,2) := 15;
  v_sl NUMERIC(5,2) := 15;
  v_pto NUMERIC(5,2) := 7;
BEGIN
  IF v_emp_id IS NULL THEN
    RETURN;
  END IF;

  SELECT e.is_active, e.employment_status_id, LOWER(TRIM(COALESCE(e.gender, ''))),
         COALESCE(es.is_regular, true)
  INTO v_is_active, v_employment_status_id, v_gender, v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = v_emp_id;

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN;
  END IF;

  -- Read defaults from leave_type_config if available
  FOR v_config IN
    SELECT c.code, c.annual_entitlement
    FROM leave_type_config c
    WHERE c.code IN ('vl', 'sl', 'pto')
  LOOP
    IF v_config.code = 'vl' THEN v_vl := v_config.annual_entitlement; END IF;
    IF v_config.code = 'sl' THEN v_sl := v_config.annual_entitlement; END IF;
    IF v_config.code = 'pto' THEN v_pto := v_config.annual_entitlement; END IF;
  END LOOP;

  IF NOT v_is_regular THEN
    SELECT lb.employee_id, lb.year, lb.vl_balance, lb.sl_balance, lb.pto_balance, lb.lwop_days_used,
           COALESCE(lb.balances, '{}')
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
      balances := v_existing.balances;
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  -- Use Regular status when employee has none
  IF v_employment_status_id IS NULL THEN
    SELECT id INTO v_employment_status_id
    FROM employment_statuses WHERE LOWER(name) = 'regular' LIMIT 1;
  END IF;

  -- Build balances JSONB for config-based types (paternity, maternity, etc.)
  FOR v_config IN
    SELECT c.code, c.annual_entitlement
    FROM leave_type_config c
    JOIN leave_type_eligibility e ON e.leave_type_config_id = c.id
    WHERE e.employment_status_id = v_employment_status_id
      AND c.code NOT IN ('vl', 'sl', 'pto', 'lwop')
      AND (e.gender_filter = 'all'
           OR (e.gender_filter = 'male' AND (v_gender = 'male' OR v_gender = 'm'))
           OR (e.gender_filter = 'female' AND (v_gender = 'female' OR v_gender = 'f')))
  LOOP
    v_balances := v_balances || jsonb_build_object(v_config.code, v_config.annual_entitlement);
  END LOOP;

  -- Insert or get existing
  INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used, balances)
  VALUES (v_emp_id, v_curr_year, v_vl, v_sl, v_pto, 0, v_balances)
  ON CONFLICT (employee_id, year) DO UPDATE SET
    balances = CASE
      WHEN leave_balances.balances IS NULL OR leave_balances.balances = '{}'
      THEN v_balances
      ELSE leave_balances.balances
    END;

  RETURN QUERY
  SELECT lb.employee_id, lb.year, lb.vl_balance, lb.sl_balance, lb.pto_balance, lb.lwop_days_used,
         COALESCE(lb.balances, '{}')
  FROM leave_balances lb
  WHERE lb.employee_id = v_emp_id AND lb.year = v_curr_year;
END;
$$;
