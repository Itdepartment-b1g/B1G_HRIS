-- ============================================================
-- B1G HRIS — Holiday type on attendance (regular / special / company)
-- Run after supabase-migration-holiday-attendance.sql
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS holiday_type TEXT;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_holiday_type_check;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_holiday_type_check
  CHECK (holiday_type IS NULL OR holiday_type IN ('regular', 'special', 'company'));

-- ============================================================
-- FUNCTION: mark_holiday_for_date(target DATE, holiday type)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_holiday_for_date(
  _target_date DATE,
  _holiday_type TEXT DEFAULT 'regular'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_dow TEXT;
  resolved_type TEXT;
BEGIN
  target_dow := to_char(_target_date, 'Dy');
  resolved_type := CASE
    WHEN _holiday_type IN ('regular', 'special', 'company') THEN _holiday_type
    ELSE 'regular'
  END;

  INSERT INTO public.attendance_records (employee_id, date, status, holiday_type, minutes_late, notes)
  SELECT DISTINCT ON (e.id)
    e.id,
    _target_date,
    'holiday'::public.attendance_status,
    resolved_type,
    0,
    'Auto-marked holiday'
  FROM public.employees e
  JOIN public.employee_shifts es ON es.employee_id = e.id
  JOIN public.shifts s           ON s.id = es.shift_id
  WHERE e.is_active = true
    AND COALESCE(e.login_exempted, false) = false
    AND s.is_active = true
    AND target_dow = ANY(s.days)
  ORDER BY e.id, s.start_time
  ON CONFLICT (employee_id, date) DO UPDATE
  SET
    status = CASE
      WHEN attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL
        THEN 'holiday'::public.attendance_status
      ELSE attendance_records.status
    END,
    holiday_type = CASE
      WHEN attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL
        THEN resolved_type
      ELSE attendance_records.holiday_type
    END,
    minutes_late = CASE
      WHEN attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL
        THEN 0
      ELSE attendance_records.minutes_late
    END,
    notes = CASE
      WHEN attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL
        THEN COALESCE(attendance_records.notes, 'Auto-marked holiday')
      ELSE attendance_records.notes
    END,
    updated_at = now();
END;
$$;

-- ============================================================
-- TRIGGER: pass holidays.type when holiday is saved
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_holiday_to_attendance_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  -- Only mark on or after the holiday date; future dates are handled by auto_mark_holiday_today cron.
  IF NEW.date <= manila_today THEN
    PERFORM public.mark_holiday_for_date(NEW.date, NEW.type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_holiday_to_attendance ON public.holidays;
CREATE TRIGGER trg_apply_holiday_to_attendance
AFTER INSERT OR UPDATE OF date, is_recurring, type
ON public.holidays
FOR EACH ROW
EXECUTE FUNCTION public.apply_holiday_to_attendance_trigger();

-- ============================================================
-- CRON wrapper: resolve today's holiday type from holidays table
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_mark_holiday_today()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  holiday_type TEXT;
BEGIN
  SELECT h.type
  INTO holiday_type
  FROM public.holidays h
  WHERE h.date = manila_today
     OR (h.is_recurring = true AND to_char(h.date, 'MM-DD') = to_char(manila_today, 'MM-DD'))
  ORDER BY h.date DESC
  LIMIT 1;

  IF holiday_type IS NOT NULL THEN
    PERFORM public.mark_holiday_for_date(manila_today, holiday_type);
  END IF;
END;
$$;

-- ============================================================
-- RPC: expose holiday_type to Attendance UI
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
  flex_undertime_minutes INTEGER,
  holiday_type TEXT,
  time_in_photo_url TEXT,
  time_out_photo_url TEXT,
  employee_code TEXT,
  employee_first_name TEXT,
  employee_middle_name TEXT,
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
    ar.flex_undertime_minutes,
    ar.holiday_type,
    ar.time_in_photo_url,
    ar.time_out_photo_url,
    e.employee_code,
    e.first_name,
    e.middle_name,
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
