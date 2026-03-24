-- ============================================================
-- B1G HRIS — Migration: Leave Management System
-- Implements leave balances, extended leave types, approval via employee_supervisors
-- Safe to re-run: uses IF NOT EXISTS, ADD COLUMN IF NOT EXISTS
-- ============================================================

-- 1. EXTEND leave_type ENUM
-- Add vl, sl, pto, lwop (keep vacation, sick, personal, maternity, paternity for backward compat)
-- Requires PostgreSQL 9.1+; IF NOT EXISTS requires PostgreSQL 15+
-- ============================================================
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'vl';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'sl';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'pto';
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'lwop';

-- 2. CREATE leave_duration_type ENUM (for fullday/first_half/second_half)
-- ============================================================
DO $$
BEGIN
  CREATE TYPE public.leave_duration_type AS ENUM ('fullday', 'first_half', 'second_half');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. CREATE leave_balances TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  vl_balance  NUMERIC(5,2) DEFAULT 15,
  sl_balance  NUMERIC(5,2) DEFAULT 15,
  pto_balance NUMERIC(5,2) DEFAULT 7,
  lwop_days_used NUMERIC(5,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, year)
);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- 4. EXTEND leave_requests TABLE
-- ============================================================
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS leave_duration_type public.leave_duration_type DEFAULT 'fullday';
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS number_of_days NUMERIC(5,2);

-- 5. ADD is_regular TO employment_statuses
-- ============================================================
ALTER TABLE public.employment_statuses ADD COLUMN IF NOT EXISTS is_regular BOOLEAN DEFAULT true;

-- 6. HELPER: is_approver_of (checks employee_supervisors - any assigned supervisor can approve)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_approver_of(_approver_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_supervisors
    WHERE employee_id = _employee_id AND supervisor_id = _approver_id
  )
$$;

-- 7. UPDATE leave_requests RLS: allow approval by employee_supervisors (in addition to supervisor_id)
-- Drop old policy and create one that includes is_approver_of
-- ============================================================
DROP POLICY IF EXISTS "Admins/supervisors update leave" ON public.leave_requests;
CREATE POLICY "Admins/supervisors update leave"
  ON public.leave_requests FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

-- Also update SELECT policy so approvers can see pending requests for their supervisees
DROP POLICY IF EXISTS "Employees read own leave or admin reads all" ON public.leave_requests;
CREATE POLICY "Employees read own leave or admin reads all"
  ON public.leave_requests FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_supervisor_of(auth.uid(), employee_id)
    OR public.is_approver_of(auth.uid(), employee_id)
  );

-- 8. leave_balances RLS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_balances' AND policyname = 'Employees read own balance or admin') THEN
    CREATE POLICY "Employees read own balance or admin"
      ON public.leave_balances FOR SELECT TO authenticated
      USING (
        employee_id = auth.uid()
        OR public.is_admin(auth.uid())
        OR public.is_supervisor_of(auth.uid(), employee_id)
        OR public.is_approver_of(auth.uid(), employee_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'leave_balances' AND policyname = 'System manages leave_balances') THEN
    CREATE POLICY "System manages leave_balances"
      ON public.leave_balances FOR ALL TO authenticated
      USING (public.is_admin(auth.uid()));
  END IF;
  -- Allow service role / functions to manage (SECURITY DEFINER handles that)
END $$;

-- 9. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee_year ON public.leave_balances(employee_id, year);

-- ============================================================
-- 10. YEAR-END / YEAR-START LEAVE AUTOMATION (pg_cron)
-- ============================================================

-- 10a. Year-end: Dec 31 - Reset SL and PTO to 0; carry VL to next year (cap 30)
CREATE OR REPLACE FUNCTION public.leave_year_end_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int + 1;
  emp RECORD;
  carried_vl NUMERIC(5,2);
  new_vl NUMERIC(5,2);
BEGIN
  FOR emp IN
    SELECT lb.employee_id, lb.vl_balance
    FROM leave_balances lb
    JOIN employees e ON e.id = lb.employee_id
    JOIN employment_statuses es ON es.id = e.employment_status_id AND es.is_regular = true
    WHERE lb.year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int
      AND e.is_active = true
  LOOP
    carried_vl := LEAST(emp.vl_balance, 30);
    INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
    VALUES (emp.employee_id, next_year, carried_vl, 0, 0, 0)
    ON CONFLICT (employee_id, year) DO UPDATE SET
      vl_balance = LEAST(EXCLUDED.vl_balance, 30),
      sl_balance = 0,
      pto_balance = 0,
      updated_at = now();
  END LOOP;

  UPDATE leave_balances lb
  SET sl_balance = 0, pto_balance = 0, updated_at = now()
  WHERE year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;
END;
$$;

-- 10b. Year-start: Jan 1 - Grant VL +15, SL +15, PTO +7 to active regular employees
CREATE OR REPLACE FUNCTION public.leave_year_start_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  curr_year INT := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;
  emp RECORD;
BEGIN
  FOR emp IN
    SELECT e.id
    FROM employees e
    LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
    WHERE e.is_active = true
      AND (es.is_regular = true OR e.employment_status_id IS NULL)
  LOOP
    INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
    VALUES (emp.id, curr_year, 15, 15, 7, 0)
    ON CONFLICT (employee_id, year) DO UPDATE SET
      vl_balance = LEAST(leave_balances.vl_balance + 15, 30),
      sl_balance = leave_balances.sl_balance + 15,
      pto_balance = leave_balances.pto_balance + 7,
      updated_at = now();
  END LOOP;
END;
$$;

-- Schedule year-end: Run Dec 31 at 11:55 PM Asia/Manila (15:55 UTC)
SELECT cron.unschedule('leave_year_end')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave_year_end');
SELECT cron.schedule('leave_year_end', '55 15 31 12 *', $$SELECT public.leave_year_end_processing()$$);

-- Schedule year-start: Run Jan 1 at 12:05 AM Asia/Manila (16:05 UTC Dec 31)
SELECT cron.unschedule('leave_year_start')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave_year_start');
SELECT cron.schedule('leave_year_start', '5 16 31 12 *', $$SELECT public.leave_year_start_processing()$$);

-- ============================================================
-- 11. LEAVE VALIDATION & SUBMISSION RPC
-- ============================================================

-- Helper: count working days between start and end (exclude weekends and holidays)
CREATE OR REPLACE FUNCTION public.count_working_days(_start DATE, _end DATE)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d DATE := _start;
  cnt INT := 0;
BEGIN
  WHILE d <= _end LOOP
    IF EXTRACT(DOW FROM d) NOT IN (0, 6)
       AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.date = d)
    THEN
      cnt := cnt + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

-- Main RPC: validate and submit leave request
CREATE OR REPLACE FUNCTION public.validate_and_submit_leave(
  p_leave_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_leave_duration_type TEXT DEFAULT 'fullday',
  p_reason TEXT DEFAULT NULL,
  p_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID := auth.uid();
  v_working_days INT;
  v_num_days NUMERIC(5,2);
  v_day_factor NUMERIC := 1;
  v_balance RECORD;
  v_is_regular BOOLEAN;
  v_shift_start TIME;
  v_weekday TEXT;
  v_submit_ts TIMESTAMPTZ;
  v_leave_date DATE;
  v_new_id UUID;
BEGIN
  IF v_emp_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_start_date > p_end_date THEN
    RETURN jsonb_build_object('success', false, 'error', 'End date must be on or after start date');
  END IF;

  SELECT es.is_regular INTO v_is_regular
  FROM employees e
  LEFT JOIN employment_statuses es ON es.id = e.employment_status_id
  WHERE e.id = v_emp_id;
  v_is_regular := COALESCE(v_is_regular, true);

  IF NOT v_is_regular AND p_leave_type != 'lwop' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Probationary employees can only file LWOP');
  END IF;

  IF p_leave_type IN ('vl', 'sl', 'pto') THEN
    v_working_days := count_working_days(p_start_date, p_end_date);
    v_day_factor := CASE p_leave_duration_type
      WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1
    END;
    v_num_days := v_working_days * v_day_factor;

    SELECT lb.vl_balance, lb.sl_balance, lb.pto_balance INTO v_balance
    FROM leave_balances lb
    WHERE lb.employee_id = v_emp_id AND lb.year = EXTRACT(YEAR FROM p_start_date)::int;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No leave balance for this year. Contact HR.');
    END IF;

    IF p_leave_type = 'vl' AND (COALESCE(v_balance.vl_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient VL balance');
    END IF;
    IF p_leave_type = 'sl' AND (COALESCE(v_balance.sl_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient SL balance');
    END IF;
    IF p_leave_type = 'pto' AND (COALESCE(v_balance.pto_balance, 0) < v_num_days) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient PTO balance');
    END IF;

    IF p_leave_type = 'vl' THEN
      IF (p_start_date - CURRENT_DATE) < 7 THEN
        RETURN jsonb_build_object('success', false, 'error', 'VL must be filed at least 7 days before the leave date');
      END IF;
    END IF;

    IF p_leave_type = 'sl' AND p_start_date = CURRENT_DATE THEN
      v_weekday := to_char(p_start_date, 'Dy');
      SELECT s.start_time INTO v_shift_start
      FROM employee_shifts es
      JOIN shifts s ON s.id = es.shift_id
      WHERE es.employee_id = v_emp_id
        AND (s.days IS NULL OR array_length(s.days, 1) IS NULL OR v_weekday = ANY(s.days))
      LIMIT 1;
      v_shift_start := COALESCE(v_shift_start, '08:00'::time);
      v_submit_ts := (now() AT TIME ZONE 'Asia/Manila');
      IF v_submit_ts::time > (v_shift_start - interval '2 hours')::time THEN
        RETURN jsonb_build_object('success', false, 'error', 'SL must be filed at least 2 hours before your shift start');
      END IF;
    END IF;
  END IF;

  v_working_days := count_working_days(p_start_date, p_end_date);
  v_day_factor := CASE p_leave_duration_type WHEN 'fullday' THEN 1 WHEN 'first_half' THEN 0.5 WHEN 'second_half' THEN 0.5 ELSE 1 END;
  v_num_days := v_working_days * v_day_factor;

  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, leave_duration_type, reason, attachment_url, number_of_days, status)
  VALUES (v_emp_id, p_leave_type::leave_type, p_start_date, p_end_date, p_leave_duration_type::leave_duration_type, p_reason, p_attachment_url, v_num_days, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================
-- 12. APPROVE/REJECT LEAVE REQUEST RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_leave_request(
  p_leave_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_approver_id UUID := auth.uid();
  v_d DATE;
  v_year INT;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT lr.*, e.employee_code INTO v_rec
  FROM leave_requests lr
  JOIN employees e ON e.id = lr.employee_id
  WHERE lr.id = p_leave_id AND lr.status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leave request not found or not pending');
  END IF;

  IF NOT (public.is_admin(v_approver_id) OR public.is_supervisor_of(v_approver_id, v_rec.employee_id) OR public.is_approver_of(v_approver_id, v_rec.employee_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  UPDATE leave_requests SET status = p_action::leave_status, approved_by = v_approver_id, approved_at = now() WHERE id = p_leave_id;

  IF p_action = 'approved' THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;
    IF v_rec.leave_type IN ('vl', 'vacation') THEN
      UPDATE leave_balances SET vl_balance = vl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('sl', 'sick') THEN
      UPDATE leave_balances SET sl_balance = sl_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type IN ('pto', 'personal') THEN
      UPDATE leave_balances SET pto_balance = pto_balance - COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_rec.leave_type = 'lwop' THEN
      INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
      VALUES (v_rec.employee_id, v_year, 0, 0, 0, COALESCE(v_rec.number_of_days, 0))
      ON CONFLICT (employee_id, year) DO UPDATE SET
        lwop_days_used = leave_balances.lwop_days_used + COALESCE(v_rec.number_of_days, 0),
        updated_at = now();
    END IF;

    FOR v_d IN SELECT d::date FROM generate_series(v_rec.start_date, v_rec.end_date, '1 day'::interval) d
    LOOP
      INSERT INTO attendance_records (employee_id, date, status)
      VALUES (v_rec.employee_id, v_d, 'on_leave')
      ON CONFLICT (employee_id, date) DO UPDATE SET status = 'on_leave', updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
