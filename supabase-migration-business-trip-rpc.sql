-- ============================================================
-- B1G HRIS — Business Trip RPC: validate_and_submit_trip, approve_trip_request
-- Requires: business_trips (with trip_type, attachment_url), attendance_records
-- (with business_trip_id), is_approver_of, employee_shifts, shifts
-- Safe to re-run.
-- ============================================================

-- 1. VALIDATE AND SUBMIT BUSINESS TRIP REQUEST
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_and_submit_trip(
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
  v_emp_id UUID := auth.uid();
  v_new_id UUID;
BEGIN
  -- Date validation: end_date >= start_date
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

  INSERT INTO business_trips (
    employee_id,
    trip_type,
    destination,
    purpose,
    start_date,
    end_date,
    attachment_url,
    status
  )
  VALUES (
    v_emp_id,
    p_trip_type,
    trim(p_location),
    trim(p_purpose),
    p_start_date,
    p_end_date,
    NULLIF(trim(p_attachment_url), ''),
    'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. APPROVE/REJECT BUSINESS TRIP REQUEST
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_trip_request(
  p_trip_id UUID,
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
  v_d DATE;
  v_dow TEXT;
  v_shift RECORD;
  v_time_in TIMESTAMPTZ;
  v_time_out TIMESTAMPTZ;
  v_work_start TIME := '08:00'::time;
  v_work_end TIME := '17:00'::time;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT bt.* INTO v_rec
  FROM business_trips bt
  WHERE bt.id = p_trip_id AND bt.status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trip request not found or not pending');
  END IF;

  -- Only admin, supervisor, or approver can approve
  IF NOT (public.is_admin(v_approver_id) OR public.is_supervisor_of(v_approver_id, v_rec.employee_id) OR public.is_approver_of(v_approver_id, v_rec.employee_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  UPDATE business_trips
  SET status = p_action::trip_status, approved_by = v_approver_id, approved_at = now()
  WHERE id = p_trip_id;

  IF p_action = 'approved' THEN
    -- Get company defaults for fallback when no shift
    SELECT COALESCE(cp.work_start_time, '08:00'::time), COALESCE(cp.work_end_time, '17:00'::time)
    INTO v_work_start, v_work_end
    FROM company_profile cp
    LIMIT 1;

    FOR v_d IN SELECT d::date FROM generate_series(v_rec.start_date, v_rec.end_date, '1 day'::interval) d
    LOOP
      -- Business Trip = Present and TEMPORARILY EXEMPT from time_in/time_out during approved dates
      v_dow := to_char(v_d, 'Dy');
      v_time_in := NULL;
      v_time_out := NULL;

      INSERT INTO attendance_records (employee_id, date, time_in, time_out, status, minutes_late, business_trip_id)
      VALUES (v_rec.employee_id, v_d, v_time_in, v_time_out, 'present'::attendance_status, 0, p_trip_id)
      ON CONFLICT (employee_id, date) DO UPDATE SET
        time_in = NULL,
        time_out = NULL,
        status = 'present'::attendance_status,
        minutes_late = 0,
        business_trip_id = EXCLUDED.business_trip_id,
        updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
