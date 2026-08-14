-- ============================================================
-- B1G HRIS — File Business Trip On Behalf
-- Immediate superiors can file for employees under them.
-- Admin / super_admin can file for any employee.
-- Trips are auto-approved (attendance marked Present).
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.business_trips
  ADD COLUMN IF NOT EXISTS filed_by_id UUID REFERENCES public.employees(id);

COMMENT ON COLUMN public.business_trips.filed_by_id IS 'Set when a superior or admin files the trip on behalf of the employee';

CREATE OR REPLACE FUNCTION public.file_trip_on_behalf(
  p_employee_id UUID,
  p_trip_type TEXT,
  p_location TEXT,
  p_purpose TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filer_id UUID := auth.uid();
  v_new_id UUID;
  v_result JSONB;
  v_is_active BOOLEAN;
BEGIN
  IF v_filer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee is required');
  END IF;

  SELECT e.is_active INTO v_is_active
  FROM public.employees e
  WHERE e.id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee not found');
  END IF;
  IF COALESCE(v_is_active, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Employee is inactive');
  END IF;

  IF NOT (
    public.is_admin(v_filer_id)
    OR public.is_supervisor_of(v_filer_id, p_employee_id)
    OR public.is_approver_of(v_filer_id, p_employee_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to file a business trip for this employee');
  END IF;

  IF p_end_date < p_start_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid dates. End date must be on or after start date.');
  END IF;

  IF NULLIF(trim(p_trip_type), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trip type is required.');
  END IF;

  IF NULLIF(trim(p_location), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Location is required.');
  END IF;

  IF NULLIF(trim(p_purpose), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Purpose is required.');
  END IF;

  INSERT INTO public.business_trips (
    employee_id,
    trip_type,
    destination,
    purpose,
    start_date,
    end_date,
    attachment_url,
    status,
    filed_by_id
  )
  VALUES (
    p_employee_id,
    trim(p_trip_type),
    trim(p_location),
    trim(p_purpose),
    p_start_date,
    p_end_date,
    NULLIF(trim(p_attachment_url), ''),
    'pending',
    v_filer_id
  )
  RETURNING id INTO v_new_id;

  SELECT public.approve_trip_request(v_new_id, 'approved') INTO v_result;

  IF COALESCE((v_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', COALESCE(v_result ->> 'error', 'Filed but auto-approve failed')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.file_trip_on_behalf(UUID, TEXT, TEXT, TEXT, DATE, DATE, TEXT) TO authenticated;
