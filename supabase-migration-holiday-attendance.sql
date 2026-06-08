-- ============================================================
-- B1G HRIS — Holiday Attendance Automation (Trigger + Cron)
-- Safe to re-run.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- Add holiday attendance status
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'holiday';

-- ============================================================
-- FUNCTION: mark_holiday_for_date(target DATE)
-- Marks eligible scheduled employees as holiday.
-- Does not overwrite rows with existing time_in/time_out.
-- ============================================================
-- Optional: run supabase-migration-holiday-type.sql for holiday_type column + typed export/UI.

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

  INSERT INTO public.attendance_records (employee_id, date, status, minutes_late, notes)
  SELECT DISTINCT ON (e.id)
    e.id,
    _target_date,
    'holiday'::public.attendance_status,
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
-- TRIGGER: Apply holiday attendance immediately on create/update
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
-- WRAPPER: Daily holiday auto-mark for today (cron safety net)
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

SELECT cron.unschedule('auto_mark_holiday_today')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto_mark_holiday_today'
);

-- 00:05 AM Manila = 16:05 UTC (previous day)
SELECT cron.schedule(
  'auto_mark_holiday_today',
  '5 16 * * *',
  $$SELECT public.auto_mark_holiday_today()$$
);

-- ============================================================
-- REPLACE: mark_absent_for_date skips holidays
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_absent_for_date(_target_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_dow TEXT;
BEGIN
  target_dow := to_char(_target_date, 'Dy');

  INSERT INTO public.attendance_records (employee_id, date, status, minutes_late)
  SELECT DISTINCT ON (e.id)
    e.id,
    _target_date,
    'absent'::public.attendance_status,
    0
  FROM public.employees e
  JOIN public.employee_shifts es ON es.employee_id = e.id
  JOIN public.shifts s           ON s.id = es.shift_id
  WHERE e.is_active = true
    AND COALESCE(e.login_exempted, false) = false
    AND s.is_active = true
    AND target_dow = ANY(s.days)
    AND NOT EXISTS (
      SELECT 1
      FROM public.holidays h
      WHERE h.date = _target_date
        OR (h.is_recurring = true AND to_char(h.date, 'MM-DD') = to_char(_target_date, 'MM-DD'))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.attendance_records ar
      WHERE ar.employee_id = e.id
        AND ar.date = _target_date
    )
  ORDER BY e.id, s.start_time
  ON CONFLICT (employee_id, date) DO NOTHING;
END;
$$;

-- Optional one-time backfill for today's holiday if it exists.
SELECT public.auto_mark_holiday_today();
