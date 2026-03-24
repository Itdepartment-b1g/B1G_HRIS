-- ============================================================
-- B1G HRIS — Migration: Auto-Mark Absent Employees (Daily)
-- Uses pg_cron to insert absent attendance records
-- for employees who did not clock in on their scheduled shift day.
-- Run this in Supabase SQL Editor
-- ============================================================

-- Requires pg_cron (already enabled by login-exempted migration)
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================
-- FUNCTION: mark_absent_for_date(target DATE)
-- ============================================================
-- Callable for ANY date. The cron job calls it for yesterday,
-- but you can also call it manually:
--   SELECT public.mark_absent_for_date('2026-03-12');
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_absent_for_date(_target_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_dow TEXT;
BEGIN
  -- Abbreviated weekday matching shifts.days format ('Mon','Tue',...)
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
      SELECT 1 FROM public.attendance_records ar
      WHERE ar.employee_id = e.id
        AND ar.date = _target_date
    )
  ORDER BY e.id, s.start_time
  ON CONFLICT (employee_id, date) DO NOTHING;
END;
$$;

-- ============================================================
-- WRAPPER: auto_mark_absent_employees() — called by pg_cron
-- ============================================================
-- Processes yesterday's date automatically each night.

CREATE OR REPLACE FUNCTION public.auto_mark_absent_employees()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_now  TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Manila';
  yesterday   DATE        := (manila_now - INTERVAL '1 day')::date;
BEGIN
  PERFORM public.mark_absent_for_date(yesterday);
END;
$$;

-- ============================================================
-- SCHEDULE: Run daily at 11:55 PM Manila time (15:55 UTC)
-- ============================================================

SELECT cron.unschedule('auto_mark_absent_employees')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto_mark_absent_employees'
);

SELECT cron.schedule(
  'auto_mark_absent_employees',
  '55 15 * * *',
  $$SELECT public.auto_mark_absent_employees()$$
);

-- ============================================================
-- ONE-TIME BACKFILL: Process the last 30 days
-- ============================================================
-- This catches up all past dates that the cron missed.
-- Safe to re-run — ON CONFLICT DO NOTHING prevents duplicates.

DO $$
DECLARE
  d DATE;
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  -- Loop from 30 days ago up to yesterday (today is still in progress)
  FOR d IN SELECT generate_series(manila_today - 30, manila_today - 1, '1 day'::interval)::date
  LOOP
    PERFORM public.mark_absent_for_date(d);
  END LOOP;
END;
$$;

-- ============================================================
-- FIX RLS: Allow admins to INSERT attendance records for any employee
-- ============================================================
-- The original policy only allowed employee_id = auth.uid().
-- Admins need to insert records when editing absent employees' time in/out.

DROP POLICY IF EXISTS "Employees insert own attendance" ON public.attendance_records;
CREATE POLICY "Employees insert own attendance"
  ON public.attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_admin(auth.uid()));
