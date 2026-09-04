-- ============================================================
-- B1G HRIS — Paginated get_attendance_records (fix 1000-row cap)
-- Run in Supabase SQL Editor
-- ============================================================
-- PostgREST max_rows (~1000) was truncating All Time results.
-- This adds _limit / _offset and a matching count RPC.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_attendance_records(DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_attendance_records(DATE, DATE, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.get_attendance_records_count(DATE, DATE, TEXT);

CREATE OR REPLACE FUNCTION public.get_attendance_records(
  _date_from DATE,
  _date_to DATE,
  _status_filter TEXT DEFAULT NULL,
  _limit INT DEFAULT 1000,
  _offset INT DEFAULT 0
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
  ORDER BY ar.date DESC, ar.time_in DESC NULLS LAST
  LIMIT GREATEST(COALESCE(_limit, 1000), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_records_count(
  _date_from DATE,
  _date_to DATE,
  _status_filter TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::BIGINT
  FROM attendance_records ar
  WHERE ar.date >= _date_from
    AND ar.date <= _date_to
    AND (_status_filter IS NULL OR ar.status::TEXT = _status_filter)
    AND (
      public.is_admin(auth.uid())
      OR public.is_supervisor_of(auth.uid(), ar.employee_id)
      OR ar.employee_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_records(DATE, DATE, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_records_count(DATE, DATE, TEXT) TO authenticated;
