-- ============================================================
-- B1G HRIS — ONE-SHOT MIGRATION FOR SUPABASE SQL EDITOR
-- Copy entire file → paste → Run once.
--
-- Includes:
--   1) Flexible shifts + flex undertime columns + DB trigger
--   2) get_attendance_records RPC (includes flex_undertime_minutes)
-- ============================================================

-- ========== PART 1: FLEX SHIFTS + ATTENDANCE TRIGGER ==========

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

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS flex_undertime_minutes INTEGER;

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS flex_required_hours_snapshot NUMERIC(4,2);

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

-- ========== PART 2: GET_ATTENDANCE_RECORDS RPC ==========

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
  time_in_photo_url TEXT,
  time_out_photo_url TEXT,
  employee_code TEXT,
  employee_first_name TEXT,
  employee_last_name TEXT
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
    ar.time_in_photo_url,
    ar.time_out_photo_url,
    e.employee_code,
    e.first_name,
    e.last_name
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
