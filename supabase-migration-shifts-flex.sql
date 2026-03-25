-- ============================================================
-- B1G HRIS — Migration: Flexible Shift Required Hours
-- Adds flexible shift flags and computed undertime persistence.
-- Safe to re-run.
-- ============================================================

-- 1) Shift-level flex settings
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS is_flexible BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS required_daily_hours NUMERIC(4,2) NOT NULL DEFAULT 8;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shifts_required_daily_hours_positive'
      AND conrelid = 'public.shifts'::regclass
  ) THEN
    ALTER TABLE public.shifts
      ADD CONSTRAINT shifts_required_daily_hours_positive
      CHECK (required_daily_hours > 0);
  END IF;
END $$;

-- 2) Attendance-level flex computed values
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS flex_undertime_minutes INTEGER;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS flex_required_hours_snapshot NUMERIC(4,2);

-- 3) Trigger: recompute flex undertime when attendance row changes
CREATE OR REPLACE FUNCTION public.recompute_flex_attendance_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_weekday TEXT;
  v_break_hours NUMERIC(4,2) := 0;
  v_required_hours NUMERIC(4,2) := 8;
  v_is_flexible BOOLEAN := FALSE;
  v_raw_hours NUMERIC := 0;
  v_break_deduction NUMERIC := 0;
  v_net_hours NUMERIC := 0;
  v_gross_threshold NUMERIC := 0;
BEGIN
  NEW.flex_undertime_minutes := NULL;
  NEW.flex_required_hours_snapshot := NULL;

  IF NEW.employee_id IS NULL OR NEW.date IS NULL THEN
    RETURN NEW;
  END IF;

  v_weekday := to_char(NEW.date::timestamp, 'Dy');

  SELECT
    COALESCE(s.is_flexible, FALSE),
    COALESCE(s.break_total_hours, 0),
    COALESCE(s.required_daily_hours, 8)
  INTO
    v_is_flexible,
    v_break_hours,
    v_required_hours
  FROM public.employee_shifts es
  JOIN public.shifts s ON s.id = es.shift_id
  WHERE es.employee_id = NEW.employee_id
    AND (s.days IS NULL OR cardinality(s.days) = 0 OR v_weekday = ANY (s.days))
  ORDER BY es.created_at DESC
  LIMIT 1;

  IF NOT v_is_flexible THEN
    RETURN NEW;
  END IF;

  NEW.flex_required_hours_snapshot := v_required_hours;

  IF NEW.time_in IS NULL OR NEW.time_out IS NULL OR NEW.time_out <= NEW.time_in THEN
    RETURN NEW;
  END IF;

  -- Keep break deduction consistent with export logic:
  -- only deduct break when worked span is near full-day threshold.
  v_raw_hours := EXTRACT(EPOCH FROM (NEW.time_out - NEW.time_in)) / 3600.0;
  v_gross_threshold := v_required_hours + v_break_hours;
  IF v_raw_hours >= (v_gross_threshold * 0.9) THEN
    v_break_deduction := v_break_hours;
  END IF;

  v_net_hours := GREATEST(0, v_raw_hours - v_break_deduction);
  NEW.flex_undertime_minutes :=
    GREATEST(0, FLOOR((v_required_hours - v_net_hours) * 60));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_flex_attendance_fields ON public.attendance_records;

CREATE TRIGGER trg_recompute_flex_attendance_fields
BEFORE INSERT OR UPDATE OF employee_id, date, time_in, time_out
ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.recompute_flex_attendance_fields();
