-- ============================================================
-- B1G HRIS — Defer holiday attendance until the holiday date
-- Run in Supabase SQL Editor (safe to re-run).
-- Future holidays are marked by auto_mark_holiday_today cron only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_holiday_to_attendance_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  manila_today DATE := (now() AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  IF NEW.date <= manila_today THEN
    PERFORM public.mark_holiday_for_date(NEW.date, NEW.type);
  END IF;
  RETURN NEW;
END;
$$;
