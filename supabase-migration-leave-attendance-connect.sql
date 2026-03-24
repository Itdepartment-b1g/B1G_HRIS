-- ============================================================
-- B1G HRIS — Connect Leave Approval → Attendance Records (Half-day aware)
--
-- Goals:
--  - Persist leave tagging on attendance_records (leave_type_code, leave_request_id)
--  - Persist half-day metadata on attendance_records (leave_duration_type, leave_day_fraction)
--  - For half-day leaves, auto-fill the WORKING HALF time_in/time_out based on employee shift:
--      first_half  => time_in = midpoint, time_out = shift_end
--      second_half => time_in = shift_start, time_out = midpoint
--    Midpoint is computed as:
--      midpoint = shift_start + (net_work_minutes / 2) + break_minutes
--    (Break is counted into the "first half" block; matches 10am-7pm w/1h break => midpoint 3pm)
--
--  - Ensure attendance stays in sync even if leave status is updated outside the RPC:
--      • AFTER UPDATE trigger on leave_requests calls a sync function
--  - Provide a one-time backfill for recent approved leaves.
--
-- Safe to re-run.
-- ============================================================

-- ============================================================
-- 1. ADD COLUMNS TO attendance_records
-- ============================================================
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS leave_type_code TEXT,
  ADD COLUMN IF NOT EXISTS leave_request_id UUID REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leave_duration_type public.leave_duration_type,
  ADD COLUMN IF NOT EXISTS leave_day_fraction NUMERIC(3,2);

COMMENT ON COLUMN public.attendance_records.leave_type_code IS 'Leave type code (vl, sl, lwop, etc.) — only set when status=on_leave';
COMMENT ON COLUMN public.attendance_records.leave_request_id IS 'FK to leave_requests — links attendance row to the approved leave';
COMMENT ON COLUMN public.attendance_records.leave_duration_type IS 'Leave duration type for on_leave days (fullday/first_half/second_half)';
COMMENT ON COLUMN public.attendance_records.leave_day_fraction IS 'Normalized day fraction for on_leave days (1 or 0.5)';

-- ============================================================
-- 2. UPDATE get_attendance_records RPC to return leave fields
-- ============================================================
DROP FUNCTION IF EXISTS public.get_attendance_records(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_attendance_records(
  _date_from DATE,
  _date_to DATE,
  _status_filter TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  date DATE,
  employee_id UUID,
  time_in TIMESTAMPTZ,
  time_out TIMESTAMPTZ,
  lat_in DOUBLE PRECISION,
  lng_in DOUBLE PRECISION,
  lat_out DOUBLE PRECISION,
  lng_out DOUBLE PRECISION,
  address_in TEXT,
  address_out TEXT,
  notes TEXT,
  remarks TEXT,
  status TEXT,
  minutes_late INTEGER,
  time_in_photo_url TEXT,
  time_out_photo_url TEXT,
  employee_code TEXT,
  employee_first_name TEXT,
  employee_last_name TEXT,
  employee_avatar_url TEXT,
  leave_type_code TEXT,
  leave_duration_type TEXT,
  leave_day_fraction NUMERIC,
  business_trip_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ar.id,
    ar.date,
    ar.employee_id,
    ar.time_in,
    ar.time_out,
    ar.lat_in,
    ar.lng_in,
    ar.lat_out,
    ar.lng_out,
    ar.address_in,
    ar.address_out,
    ar.notes,
    ar.remarks,
    ar.status::TEXT,
    ar.minutes_late,
    ar.time_in_photo_url,
    ar.time_out_photo_url,
    e.employee_code,
    e.first_name,
    e.last_name,
    e.avatar_url,
    ar.leave_type_code,
    ar.leave_duration_type::TEXT,
    ar.leave_day_fraction,
    ar.business_trip_id
  FROM attendance_records ar
  JOIN employees e ON e.id = ar.employee_id
  WHERE ar.date >= _date_from
    AND ar.date <= _date_to
    AND (_status_filter IS NULL OR ar.status::TEXT = _status_filter)
    AND (
      public.is_admin(auth.uid())
      OR public.is_supervisor_of(auth.uid(), ar.employee_id)
      OR ar.employee_id = auth.uid()
    )
  ORDER BY ar.date DESC, ar.time_in DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_records(DATE, DATE, TEXT) TO authenticated;

-- ============================================================
-- 3. Helper: apply an APPROVED leave to attendance_records (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_approved_leave_to_attendance(p_leave_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_d DATE;
  v_dow TEXT;
  v_leave_code TEXT;
  v_duration_type public.leave_duration_type;
  v_day_fraction NUMERIC(3,2);
  v_shift RECORD;
  v_work_start TIME := '08:00'::time;
  v_work_end TIME := '17:00'::time;
  v_shift_start TIME;
  v_shift_end TIME;
  v_mid_time TIME;
  v_time_in TIMESTAMPTZ;
  v_time_out TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_rec
  FROM public.leave_requests
  WHERE id = p_leave_id AND status = 'approved';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Resolve leave type + duration
  v_leave_code := v_rec.leave_type::text;
  v_duration_type := COALESCE(v_rec.leave_duration_type, 'fullday'::public.leave_duration_type);
  v_day_fraction := CASE v_duration_type WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1 END;

  -- Company defaults for fallback when no shift is found
  SELECT COALESCE(cp.work_start_time, '08:00'::time), COALESCE(cp.work_end_time, '17:00'::time)
  INTO v_work_start, v_work_end
  FROM public.company_profile cp
  LIMIT 1;

  FOR v_d IN SELECT d::date FROM generate_series(v_rec.start_date, v_rec.end_date, '1 day'::interval) d
  LOOP
    v_dow := to_char(v_d, 'Dy');
    SELECT s.start_time, s.end_time, COALESCE(s.break_total_hours, 0) AS break_total_hours INTO v_shift
    FROM public.employee_shifts es
    JOIN public.shifts s ON s.id = es.shift_id
    WHERE es.employee_id = v_rec.employee_id
      AND s.is_active = true
      AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_dow = ANY(s.days))
    ORDER BY s.start_time
    LIMIT 1;

    IF FOUND THEN
      v_shift_start := v_shift.start_time;
      v_shift_end := v_shift.end_time;
    ELSE
      v_shift_start := v_work_start;
      v_shift_end := v_work_end;
      v_shift.break_total_hours := 0;
    END IF;

    v_mid_time := (
      v_shift_start
      + make_interval(
          mins => (
            (
              GREATEST(
                0,
                (
                  CASE
                    WHEN (extract(epoch from v_shift_end) - extract(epoch from v_shift_start)) >= 0
                      THEN (extract(epoch from v_shift_end) - extract(epoch from v_shift_start)) / 60
                    ELSE (extract(epoch from v_shift_end) - extract(epoch from v_shift_start) + 24 * 3600) / 60
                  END
                )
                - (COALESCE((v_shift.break_total_hours)::numeric, 0) * 60)
              ) / 2
              + (COALESCE((v_shift.break_total_hours)::numeric, 0) * 60)
            )::int
          )
        )
    )::time;

    -- IMPORTANT: For half-day leave, employee must still clock in/out for accurate computation.
    -- We DO NOT auto-populate time_in/time_out. We only tag the day.
    v_time_in := NULL;
    v_time_out := NULL;

    INSERT INTO public.attendance_records (
      employee_id,
      date,
      time_in,
      time_out,
      status,
      minutes_late,
      leave_type_code,
      leave_request_id,
      leave_duration_type,
      leave_day_fraction
    )
    VALUES (
      v_rec.employee_id,
      v_d,
      v_time_in,
      v_time_out,
      CASE
        WHEN v_duration_type = 'fullday' THEN 'on_leave'::public.attendance_status
        ELSE 'present'::public.attendance_status
      END,
      0,
      v_leave_code,
      p_leave_id,
      v_duration_type,
      v_day_fraction
    )
    ON CONFLICT (employee_id, date) DO UPDATE SET
      status = CASE
        WHEN EXCLUDED.leave_duration_type = 'fullday' THEN 'on_leave'::public.attendance_status
        ELSE 'present'::public.attendance_status
      END,
      minutes_late = 0,
      time_in = COALESCE(attendance_records.time_in, EXCLUDED.time_in),
      time_out = COALESCE(attendance_records.time_out, EXCLUDED.time_out),
      leave_type_code = EXCLUDED.leave_type_code,
      leave_request_id = EXCLUDED.leave_request_id,
      leave_duration_type = EXCLUDED.leave_duration_type,
      leave_day_fraction = EXCLUDED.leave_day_fraction,
      updated_at = now();
  END LOOP;
END;
$$;

-- ============================================================
-- 4. Trigger: keep attendance_records synced with leave_requests status changes
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_leave_to_attendance ON public.leave_requests;

CREATE OR REPLACE FUNCTION public.sync_leave_to_attendance_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.apply_approved_leave_to_attendance(NEW.id);
    ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
      DELETE FROM public.attendance_records WHERE leave_request_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_leave_to_attendance
AFTER UPDATE OF status ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_leave_to_attendance_trigger();

-- ============================================================
-- 5. Update approve_leave_request RPC (calls sync helper)
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_leave_id UUID,
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
  v_year INT;
  v_balance RECORD;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT lr.*, e.employee_code INTO v_rec
  FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id
  WHERE lr.id = p_leave_id AND lr.status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leave request not found or not pending');
  END IF;

  IF NOT (public.is_admin(v_approver_id) OR public.is_supervisor_of(v_approver_id, v_rec.employee_id) OR public.is_approver_of(v_approver_id, v_rec.employee_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  -- Balance checks (same as existing)
  IF p_action = 'approved' AND v_rec.leave_type IN ('vl', 'vacation', 'sl', 'sick', 'pto', 'personal') THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;
    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM public.leave_balances lb
    WHERE lb.employee_id = v_rec.employee_id AND lb.year = v_year;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;
    IF v_rec.leave_type IN ('vl', 'vacation') AND COALESCE(v_balance.vl_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient VL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('sl', 'sick') AND COALESCE(v_balance.sl_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient SL balance to approve');
    END IF;
    IF v_rec.leave_type IN ('pto', 'personal') AND COALESCE(v_balance.pto_balance, 0) < COALESCE(v_rec.number_of_days, 0) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance to approve');
    END IF;
  END IF;

  UPDATE public.leave_requests
  SET status = p_action::public.leave_status, approved_by = v_approver_id, approved_at = now()
  WHERE id = p_leave_id;

  IF p_action = 'approved' THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;
    IF v_rec.leave_type IN ('vl', 'vacation') THEN
      UPDATE public.leave_balances SET vl_balance = vl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('sl', 'sick') THEN
      UPDATE public.leave_balances SET sl_balance = sl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('pto', 'personal') THEN
      UPDATE public.leave_balances SET pto_balance = pto_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type = 'lwop' THEN
      INSERT INTO public.leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
      VALUES (v_rec.employee_id, v_year, 0, 0, 0, COALESCE(v_rec.number_of_days, 0))
      ON CONFLICT (employee_id, year) DO UPDATE SET
        lwop_days_used = public.leave_balances.lwop_days_used + COALESCE(v_rec.number_of_days, 0),
        updated_at = now();
    END IF;

    PERFORM public.apply_approved_leave_to_attendance(p_leave_id);
  ELSE
    DELETE FROM public.attendance_records WHERE leave_request_id = p_leave_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 6. One-time backfill (recent approved leaves)
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id
    FROM public.leave_requests
    WHERE status = 'approved'
      AND start_date >= (CURRENT_DATE - INTERVAL '60 days')::date
  LOOP
    PERFORM public.apply_approved_leave_to_attendance(r.id);
  END LOOP;
END $$;

