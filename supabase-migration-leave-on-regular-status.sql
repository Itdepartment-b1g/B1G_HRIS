-- ============================================================
-- B1G HRIS — Migration: Grant Leave Credits When Employee Becomes Regular
-- When employment_status_id changes to a regular status (is_regular = true),
-- automatically grant 15 VL, 15 SL, 7 PTO for the current year.
-- LWOP remains unlimited (no balance check).
-- Safe to re-run.
-- ============================================================

-- Function: grant leave credits when employee becomes regular
CREATE OR REPLACE FUNCTION public.grant_leave_on_become_regular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_regular BOOLEAN;
  v_old_regular BOOLEAN;
  v_curr_year INT;
BEGIN
  IF NEW.employment_status_id IS NOT DISTINCT FROM OLD.employment_status_id THEN
    RETURN NEW;
  END IF;

  v_curr_year := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;

  -- Check if NEW status is regular
  SELECT COALESCE(es.is_regular, false) INTO v_new_regular
  FROM employment_statuses es
  WHERE es.id = NEW.employment_status_id;

  -- Check if OLD status was regular (or null)
  IF OLD.employment_status_id IS NULL THEN
    v_old_regular := false;
  ELSE
    SELECT COALESCE(es.is_regular, false) INTO v_old_regular
    FROM employment_statuses es
    WHERE es.id = OLD.employment_status_id;
  END IF;

  -- Only grant when transitioning TO regular (new=regular, old=not regular)
  IF v_new_regular = true AND (v_old_regular = false OR OLD.employment_status_id IS NULL) THEN
    IF NEW.is_active = true THEN
      INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
      VALUES (NEW.id, v_curr_year, 15, 15, 7, 0)
      ON CONFLICT (employee_id, year) DO UPDATE SET
        vl_balance = LEAST(leave_balances.vl_balance + 15, 30),
        sl_balance = leave_balances.sl_balance + 15,
        pto_balance = leave_balances.pto_balance + 7,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: fire on employees.employment_status_id update
DROP TRIGGER IF EXISTS trg_grant_leave_on_become_regular ON public.employees;
CREATE TRIGGER trg_grant_leave_on_become_regular
  AFTER UPDATE OF employment_status_id
  ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_leave_on_become_regular();
