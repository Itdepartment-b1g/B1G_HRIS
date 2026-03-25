-- ============================================================
-- B1G HRIS — Migration: Block assigning inactive supervisors (block-only)
--
-- Prevent writing relationships where an inactive employee is used as a supervisor.
-- This blocks new/updated writes but does NOT delete existing rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.block_inactive_supervisor_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If supervisor_id is null, allow (assignment cleared).
  IF NEW.supervisor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reject if the referenced supervisor is inactive.
  IF EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = NEW.supervisor_id
      AND e.is_active = false
  ) THEN
    RAISE EXCEPTION 'Cannot assign inactive employee as supervisor_id: %', NEW.supervisor_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Block employee_supervisors.supervisor_id
DROP TRIGGER IF EXISTS trg_block_inactive_supervisors_assignment ON public.employee_supervisors;
CREATE TRIGGER trg_block_inactive_supervisors_assignment
BEFORE INSERT OR UPDATE OF supervisor_id
ON public.employee_supervisors
FOR EACH ROW
EXECUTE FUNCTION public.block_inactive_supervisor_assignment();

-- Block employees.supervisor_id (denormalized primary supervisor)
DROP TRIGGER IF EXISTS trg_block_inactive_employees_supervisor_id ON public.employees;
CREATE TRIGGER trg_block_inactive_employees_supervisor_id
BEFORE INSERT OR UPDATE OF supervisor_id
ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.block_inactive_supervisor_assignment();

