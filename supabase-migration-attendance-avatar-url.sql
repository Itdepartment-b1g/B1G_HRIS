-- ============================================================
-- B1G HRIS — Add employee_avatar_url to get_attendance_records RPC
-- Enables profile picture display in attendance list when clock-in/out photo is missing
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
  employee_avatar_url TEXT
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
    e.avatar_url
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
