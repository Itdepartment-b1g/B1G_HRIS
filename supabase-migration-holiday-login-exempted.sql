-- ============================================================
-- B1G HRIS — Include login-exempted employees in holiday marking
-- Run in Supabase SQL Editor AFTER:
--   supabase-migration-holiday-attendance.sql
--   supabase-migration-holiday-type.sql
-- Safe to re-run.
-- ============================================================

-- ============================================================
-- HELPER: is_holiday_date
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_holiday_date(_target_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.holidays h
    WHERE h.date = _target_date
       OR (h.is_recurring = true
           AND to_char(h.date, 'MM-DD') = to_char(_target_date, 'MM-DD'))
  );
$$;

-- ============================================================
-- FUNCTION: mark_holiday_for_date
-- Now includes login-exempted employees and overwrites their
-- auto-generated present rows (with time_in/time_out) on holiday.
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
    AND s.is_active = true
    AND target_dow = ANY(s.days)
  ORDER BY e.id, s.start_time
  ON CONFLICT (employee_id, date) DO UPDATE
  SET
    status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      OR (attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL)
      THEN 'holiday'::public.attendance_status
      ELSE attendance_records.status
    END,
    holiday_type = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      OR (attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL)
      THEN resolved_type
      ELSE attendance_records.holiday_type
    END,
    time_in = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      THEN NULL
      ELSE attendance_records.time_in
    END,
    time_out = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      THEN NULL
      ELSE attendance_records.time_out
    END,
    minutes_late = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      OR (attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL)
      THEN 0
      ELSE attendance_records.minutes_late
    END,
    notes = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = attendance_records.employee_id
          AND COALESCE(e.login_exempted, false) = true
      )
      OR (attendance_records.time_in IS NULL AND attendance_records.time_out IS NULL)
      THEN COALESCE(attendance_records.notes, 'Auto-marked holiday')
      ELSE attendance_records.notes
    END,
    updated_at = now();
END;
$$;

-- ============================================================
-- FUNCTION: auto_record_login_exempted_attendance
-- Skip holidays so present is not re-applied after holiday marking.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_record_login_exempted_attendance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_now   TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Manila';
  today_date   DATE        := manila_now::date;
  today_dow    TEXT;
BEGIN
  IF public.is_holiday_date(today_date) THEN
    RETURN;
  END IF;

  today_dow := to_char(manila_now, 'Dy');

  INSERT INTO public.attendance_records (employee_id, date, time_in, time_out, status, minutes_late)
  SELECT
    e.id,
    today_date,
    (today_date || ' ' || s.start_time)::timestamp AT TIME ZONE 'Asia/Manila',
    (today_date || ' ' || s.end_time)::timestamp AT TIME ZONE 'Asia/Manila',
    'present'::public.attendance_status,
    0
  FROM public.employees e
  JOIN public.employee_shifts es ON es.employee_id = e.id
  JOIN public.shifts s           ON s.id = es.shift_id
  WHERE e.login_exempted = true
    AND e.is_active = true
    AND s.is_active = true
    AND today_dow = ANY(s.days)
    AND manila_now::time >= s.start_time
  ON CONFLICT (employee_id, date) DO NOTHING;
END;
$$;

-- ============================================================
-- OPTIONAL BACKFILL: re-apply holiday marking for past holidays
-- ============================================================
SELECT public.mark_holiday_for_date(h.date, h.type)
FROM public.holidays h
WHERE h.date <= (now() AT TIME ZONE 'Asia/Manila')::date;
