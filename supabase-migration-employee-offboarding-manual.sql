-- ============================================================
-- B1G HRIS — Migration: Manual Offboarding (AWOL/Resigned/Terminated)
-- Ensures employees.is_active is automatically set based on employment_statuses.name.
--
-- When employment_status_id changes:
-- - AWOL / Resigned / Terminated => employees.is_active = false
-- - Otherwise => employees.is_active = true
--
-- Backfill existing employees using their current employment_status_id.
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_employee_is_active_from_employment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status_name TEXT;
BEGIN
  -- Default to active unless status explicitly indicates offboarding.
  NEW.is_active := TRUE;

  IF NEW.employment_status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT es.name
  INTO v_status_name
  FROM public.employment_statuses es
  WHERE es.id = NEW.employment_status_id;

  IF v_status_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_status_name ILIKE '%awol%'
     OR v_status_name ILIKE '%resign%'
     OR v_status_name ILIKE '%terminat%'
  THEN
    NEW.is_active := FALSE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_is_active_from_employment_status
ON public.employees;

CREATE TRIGGER trg_sync_employee_is_active_from_employment_status
BEFORE INSERT OR UPDATE OF employment_status_id
ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.sync_employee_is_active_from_employment_status();

-- Backfill existing employees based on current employment_status_id.
-- If the status is offboarding, mark inactive; otherwise activate.
UPDATE public.employees e
SET is_active = CASE
  WHEN es.name ILIKE '%awol%'
    OR es.name ILIKE '%resign%'
    OR es.name ILIKE '%terminat%'
  THEN FALSE
  ELSE TRUE
END
FROM public.employment_statuses es
WHERE e.employment_status_id = es.id;

