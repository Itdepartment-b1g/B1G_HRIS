-- ============================================================
-- B1G HRIS — Fix Duplicate Leave Balance Grant on Employment Status Toggle
-- When employment status toggles (e.g. Intern -> Regular -> Intern -> Regular),
-- the trigger was granting credits every time. Now grants at most once per year.
-- Safe to re-run.
-- ============================================================

-- 1. ADD TRACKING COLUMN
-- ============================================================
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS regularization_granted_year INT;

COMMENT ON COLUMN public.leave_balances.regularization_granted_year IS 'Year when regularization credits were last granted; used to avoid duplicate grants when employment status toggles.';

-- 2. REPLACE TRIGGER FUNCTION (idempotent: grant only once per employee per year)
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

      -- Grant credits (first time this year or row exists from prior year/LWOP)
      INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used, regularization_granted_year)
      VALUES (NEW.id, v_curr_year, 15, 15, 7, 0, v_curr_year)
      ON CONFLICT (employee_id, year) DO UPDATE SET
        vl_balance = LEAST(leave_balances.vl_balance + 15, 30),
        sl_balance = leave_balances.sl_balance + 15,
        pto_balance = leave_balances.pto_balance + 7,
        regularization_granted_year = v_curr_year,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. BACKFILL: Mark existing leave_balances for current year as "already granted"
--    Only for employees who are currently regular. Prevents double-grant when
--    status is toggled for users who became regular before this migration.
-- ============================================================
UPDATE public.leave_balances lb
SET regularization_granted_year = lb.year,
    updated_at = now()
FROM public.employees e
JOIN public.employment_statuses es ON es.id = e.employment_status_id AND COALESCE(es.is_regular, false) = true
WHERE lb.employee_id = e.id
  AND lb.regularization_granted_year IS NULL
  AND lb.year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;
