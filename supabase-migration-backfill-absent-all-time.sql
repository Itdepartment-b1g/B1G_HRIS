-- ============================================================
-- B1G HRIS — Backfill absents from start → yesterday + re-seat cron
-- Run in Supabase SQL Editor
--
-- Safe to re-run: ON CONFLICT / NOT EXISTS prevent duplicates.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ------------------------------------------------------------
-- 1) Harden mark_absent_for_date
--    - trim(to_char(...,'Dy')) avoids locale space-padding mismatches
--    - empty/null shift.days = scheduled every day (matches frontend)
--    - still skips holidays
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_absent_for_date(_target_date DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_dow TEXT;
BEGIN
  target_dow := trim(to_char(_target_date, 'Dy'));

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
    AND (
      s.days IS NULL
      OR cardinality(s.days) = 0
      OR target_dow = ANY (s.days)
    )
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

CREATE OR REPLACE FUNCTION public.auto_mark_absent_employees()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  manila_now TIMESTAMPTZ := now() AT TIME ZONE 'Asia/Manila';
  yesterday  DATE        := (manila_now - INTERVAL '1 day')::date;
BEGIN
  PERFORM public.mark_absent_for_date(yesterday);
END;
$$;

-- ------------------------------------------------------------
-- 2) Re-seat daily cron (11:55 PM Manila = 15:55 UTC)
-- ------------------------------------------------------------
SELECT cron.unschedule('auto_mark_absent_employees')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto_mark_absent_employees'
);

SELECT cron.schedule(
  'auto_mark_absent_employees',
  '55 15 * * *',
  $$SELECT public.auto_mark_absent_employees()$$
);

-- ------------------------------------------------------------
-- 3) Backfill from earliest attendance date → yesterday (one pass)
-- ------------------------------------------------------------
DO $$
DECLARE
  d DATE;
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
  gap_start DATE;
  gap_end DATE := manila_today - 1;
BEGIN
  SELECT MIN(date) INTO gap_start FROM public.attendance_records;

  -- Fallback if table is empty: start 90 days ago
  IF gap_start IS NULL THEN
    gap_start := manila_today - 90;
  END IF;

  IF gap_end >= gap_start THEN
    FOR d IN SELECT generate_series(gap_start, gap_end, '1 day'::interval)::date
    LOOP
      PERFORM public.mark_absent_for_date(d);
    END LOOP;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4) Sanity checks (optional — review results in SQL Editor)
-- ------------------------------------------------------------
SELECT date, status, count(*) AS rows
FROM public.attendance_records
WHERE date >= (SELECT MIN(date) FROM public.attendance_records)
  AND date < (now() AT TIME ZONE 'Asia/Manila')::date
GROUP BY date, status
ORDER BY date DESC, status
LIMIT 100;

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'auto_mark_absent_employees';
