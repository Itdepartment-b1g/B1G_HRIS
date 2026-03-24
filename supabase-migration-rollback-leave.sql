-- ============================================================
-- B1G HRIS — Migration: Rollback Leave Management
-- Drops leave-related tables, functions, trigger, and cron jobs.
-- Run this to remove the leave management system.
-- ============================================================

-- 1. DROP TRIGGER (depends on function)
DROP TRIGGER IF EXISTS trg_grant_leave_on_become_regular ON public.employees;

-- 2. DROP FUNCTIONS
DROP FUNCTION IF EXISTS public.grant_leave_on_become_regular();
DROP FUNCTION IF EXISTS public.validate_and_submit_leave(TEXT, DATE, DATE, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.approve_leave_request(UUID, TEXT);
DROP FUNCTION IF EXISTS public.count_working_days(DATE, DATE);
DROP FUNCTION IF EXISTS public.leave_year_end_processing();
DROP FUNCTION IF EXISTS public.leave_year_start_processing();

-- 3. UNSCHEDULE CRON JOBS (if pg_cron extension exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave_year_end') THEN
    PERFORM cron.unschedule('leave_year_end');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'leave_year_start') THEN
    PERFORM cron.unschedule('leave_year_start');
  END IF;
EXCEPTION WHEN undefined_table OR undefined_object THEN NULL;
END $$;

-- 4. DROP TABLES (leave_balances first, then leave_requests)
DROP TABLE IF EXISTS public.leave_balances;
DROP TABLE IF EXISTS public.leave_requests;
