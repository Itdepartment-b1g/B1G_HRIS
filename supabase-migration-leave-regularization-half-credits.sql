-- ============================================================
-- B1G HRIS — Regularization Leave Credits: Half Annual Grant
-- When employment status changes to regular (is_regular = true),
-- grant VL 7.5, SL 7.5, PTO 3.5 for the current year (Asia/Manila).
-- Previously granted 15 / 15 / 7.
-- Keeps once-per-year guard (regularization_granted_year).
-- Safe to re-run.
-- ============================================================

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
  v_granted_year INT;
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
      -- Check if we already granted for this year (avoid duplicate on status toggle)
      SELECT regularization_granted_year INTO v_granted_year
      FROM leave_balances
      WHERE employee_id = NEW.id AND year = v_curr_year;

      IF v_granted_year = v_curr_year THEN
        -- Already granted this year; do nothing
        RETURN NEW;
      END IF;

      -- Grant half annual credits on regularization
      INSERT INTO leave_balances (
        employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used, regularization_granted_year
      )
      VALUES (NEW.id, v_curr_year, 7.5, 7.5, 3.5, 0, v_curr_year)
      ON CONFLICT (employee_id, year) DO UPDATE SET
        vl_balance = LEAST(leave_balances.vl_balance + 7.5, 30),
        sl_balance = leave_balances.sl_balance + 7.5,
        pto_balance = leave_balances.pto_balance + 3.5,
        regularization_granted_year = v_curr_year,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
