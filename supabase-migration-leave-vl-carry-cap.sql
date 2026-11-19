-- B1G HRIS — Cap unused VL carried into the next year at 7 days
--
-- Year-end still copies leftover VL into next year's row, then Jan 1 still grants +15.
-- Only the carried remainder changes: at most 7 days.
--   6 remaining  -> carry 6, then +15 = 21
--   10 remaining -> carry 7, then +15 = 22
-- Sick leave and PTO are unchanged (reset, then granted on Jan 1).
--
-- Run in the Supabase SQL editor after supabase-migration-leave-management.sql.

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
    carried_vl := LEAST(GREATEST(COALESCE(emp.vl_balance, 0), 0), 7);
    INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used)
    VALUES (emp.employee_id, next_year, carried_vl, 0, 0, 0)
    ON CONFLICT (employee_id, year) DO UPDATE SET
      vl_balance = LEAST(GREATEST(COALESCE(EXCLUDED.vl_balance, 0), 0), 7),
      sl_balance = 0,
      pto_balance = 0,
      updated_at = now();
  END LOOP;

  UPDATE leave_balances lb
  SET sl_balance = 0, pto_balance = 0, updated_at = now()
  WHERE year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Manila'))::int;
END;
$$;
