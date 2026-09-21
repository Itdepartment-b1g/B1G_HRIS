-- ============================================================
-- B1G HRIS — Fix OT hours timezone mix-up
-- validate_and_submit_overtime subtracted a Manila timestamptz from a
-- timezone-less timestamp. On UTC databases that added +8 hours
-- (7pm–10pm Manila stored as 11.00 instead of 3.00).
-- Also backfills overtime_requests.hours from start_time/end_time,
-- and corrects CTO already credited from inflated hours.
-- Does NOT replace approve_overtime_request.
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.overtime_requests
  ALTER COLUMN hours TYPE NUMERIC(6,2);

CREATE OR REPLACE FUNCTION public.validate_and_submit_overtime(
  p_ot_date DATE,
  p_reason TEXT,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID := auth.uid();
  v_att RECORD;
  v_shift_end TIME;
  v_end_time TIME;
  v_weekday TEXT;
  v_raw_mins INT;
  v_rounded_mins INT;
  v_ot_hours NUMERIC(6,2);
  v_time_out_local TIMESTAMP;
  v_shift_end_local TIMESTAMP;
  v_new_id UUID;
BEGIN
  IF public.has_role(v_emp_id, 'manager') OR public.has_role(v_emp_id, 'executive') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Managers and executives are not eligible for overtime');
  END IF;

  SELECT ar.time_in, ar.time_out, ar.status
  INTO v_att
  FROM attendance_records ar
  WHERE ar.employee_id = v_emp_id AND ar.date = p_ot_date;

  IF NOT FOUND OR v_att.time_in IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No attendance record for this date');
  END IF;

  IF v_att.status = 'absent' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot file OT when absent');
  END IF;

  IF v_att.time_out IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  v_weekday := to_char(p_ot_date, 'Dy');
  SELECT s.end_time INTO v_shift_end
  FROM employee_shifts es
  JOIN shifts s ON s.id = es.shift_id
  WHERE es.employee_id = v_emp_id
    AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_weekday = ANY(s.days))
  ORDER BY s.end_time DESC
  LIMIT 1;

  IF v_shift_end IS NULL THEN
    v_shift_end := '19:00'::time;
  END IF;

  -- Manila wall-clock on both sides (never mix timestamptz with timestamp).
  v_time_out_local := v_att.time_out AT TIME ZONE 'Asia/Manila';
  v_shift_end_local := p_ot_date::timestamp + v_shift_end;
  v_end_time := v_time_out_local::time;

  IF v_time_out_local <= v_shift_end_local THEN
    RETURN jsonb_build_object('success', false, 'error', 'No overtime recorded. Time-out must be after shift end.');
  END IF;

  v_raw_mins := FLOOR(EXTRACT(EPOCH FROM (v_end_time - v_shift_end)) / 60)::int;
  IF v_raw_mins < 0 THEN
    v_raw_mins := v_raw_mins + (24 * 60);
  END IF;

  IF v_raw_mins > (24 * 60) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Overtime cannot exceed 24 hours. Check your time-out record.');
  END IF;

  v_rounded_mins := (v_raw_mins / 30) * 30;

  IF v_rounded_mins < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum overtime is 1 hour');
  END IF;

  v_ot_hours := ROUND((v_rounded_mins / 60.0)::numeric, 2);

  IF EXISTS (
    SELECT 1 FROM overtime_requests
    WHERE employee_id = v_emp_id
      AND date = p_ot_date
      AND status IN ('pending', 'approved')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT already filed for this date');
  END IF;

  INSERT INTO overtime_requests (
    employee_id,
    date,
    start_time,
    end_time,
    hours,
    reason,
    attachment_url,
    status
  )
  VALUES (
    v_emp_id,
    p_ot_date,
    v_shift_end,
    v_end_time,
    v_ot_hours,
    NULLIF(trim(p_reason), ''),
    NULLIF(trim(p_attachment_url), ''),
    'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Correct CTO first, while old hours are still on the row.
WITH corrected AS (
  SELECT
    employee_id,
    EXTRACT(YEAR FROM date)::int AS year,
    ROUND((
      (
        FLOOR(
          EXTRACT(EPOCH FROM (
            CASE
              WHEN end_time >= start_time THEN end_time - start_time
              ELSE (end_time + INTERVAL '24 hours') - start_time
            END
          )) / 60 / 30
        ) * 30 / 60.0
      ) / 8
    )::numeric, 3)
    - ROUND((COALESCE(hours, 0) / 8)::numeric, 3) AS cto_delta
  FROM public.overtime_requests
  WHERE status = 'approved'
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL
),
delta AS (
  SELECT employee_id, year, SUM(cto_delta) AS cto_delta
  FROM corrected
  WHERE cto_delta <> 0
  GROUP BY employee_id, year
)
UPDATE public.leave_balances lb
SET
  balances = jsonb_set(
    COALESCE(lb.balances, '{}'::jsonb),
    '{cto}',
    to_jsonb(ROUND((GREATEST(0, COALESCE((lb.balances->>'cto')::numeric, 0) + d.cto_delta))::numeric, 3))
  ),
  updated_at = now()
FROM delta d
WHERE lb.employee_id = d.employee_id
  AND lb.year = d.year;

UPDATE public.overtime_requests
SET hours = (
  FLOOR(
    EXTRACT(EPOCH FROM (
      CASE
        WHEN end_time >= start_time THEN end_time - start_time
        ELSE (end_time + INTERVAL '24 hours') - start_time
      END
    )) / 60 / 30
  ) * 30 / 60.0
)
WHERE start_time IS NOT NULL
  AND end_time IS NOT NULL;
