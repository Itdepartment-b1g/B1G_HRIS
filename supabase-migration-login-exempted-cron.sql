-- ============================================================
-- B1G HRIS — Migration: Auto-Record Attendance for Login-Exempted Employees
-- Uses pg_cron to auto-populate time_in / time_out based on assigned shift
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. ENABLE pg_cron EXTENSION (Supabase supports this)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage so cron jobs can run in the public schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- 2. CREATE THE FUNCTION
-- ============================================================
-- This function finds all login-exempted, active employees whose
-- shift start_time has been reached for today (Asia/Manila),
-- and inserts an attendance record with time_in = shift start,
-- time_out = shift end, status = 'present', minutes_late = 0.
-- If a record already exists for that employee+date, it is skipped.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_record_login_exempted_attendance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_now   TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Manila';
  today_date   DATE        := manila_now::date;
  today_dow    TEXT;        -- e.g. 'Mon', 'Tue', ...
BEGIN
  -- Get abbreviated weekday matching the shifts.days format
  today_dow := to_char(manila_now, 'Dy');
  -- to_char returns 'Mon','Tue','Wed','Thu','Fri','Sat','Sun'

  INSERT INTO public.attendance_records (employee_id, date, time_in, time_out, status, minutes_late)
  SELECT
    e.id,
    today_date,
    -- Construct time_in as today's date + shift start_time in Manila timezone
    (today_date || ' ' || s.start_time)::timestamp AT TIME ZONE 'Asia/Manila',
    -- Construct time_out as today's date + shift end_time in Manila timezone
    (today_date || ' ' || s.end_time)::timestamp AT TIME ZONE 'Asia/Manila',
    'present'::public.attendance_status,
    0
  FROM public.employees e
  -- Join to get assigned shift(s) via junction table
  JOIN public.employee_shifts es ON es.employee_id = e.id
  JOIN public.shifts s           ON s.id = es.shift_id
  WHERE e.login_exempted = true
    AND e.is_active = true
    AND s.is_active = true
    -- Only for shifts that include today's weekday
    AND today_dow = ANY(s.days)
    -- Only once the shift start time has been reached
    AND manila_now::time >= s.start_time
  -- If employee has multiple matching shifts, pick the earliest start_time
  ON CONFLICT (employee_id, date) DO NOTHING;
END;
$$;

-- 3. SCHEDULE THE CRON JOB
-- ============================================================
-- Runs every 30 minutes so records are created shortly after
-- each shift's start_time is reached.
-- pg_cron uses UTC — 'Asia/Manila' is UTC+8.
-- Running at */30 covers all shift start times within ~30 min.
-- ============================================================

-- Remove existing job if re-running this migration
SELECT cron.unschedule('auto_login_exempted_attendance')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto_login_exempted_attendance'
);

-- Schedule: every 30 minutes
SELECT cron.schedule(
  'auto_login_exempted_attendance',          -- job name
  '*/30 * * * *',                            -- every 30 minutes
  $$SELECT public.auto_record_login_exempted_attendance()$$
);
