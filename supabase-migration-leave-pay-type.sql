-- ============================================================
-- B1G HRIS — Migration: Add pay_type to leave_type_config
-- Determines whether a leave type is Paid or Unpaid.
--   paid   → counts as present in payroll (NoOfHours = shift net hours)
--   unpaid → counts as absence in payroll (NoOfHours = 0, Absences += 1)
-- Both display as "On Leave (code)" on the Attendance page with no time in/out.
-- Safe to re-run.
-- ============================================================

-- 1. Add pay_type column (default 'paid')
ALTER TABLE public.leave_type_config
  ADD COLUMN IF NOT EXISTS pay_type TEXT NOT NULL DEFAULT 'paid'
  CHECK (pay_type IN ('paid', 'unpaid'));

COMMENT ON COLUMN public.leave_type_config.pay_type
  IS 'paid = counts as present for payroll (full shift hours); unpaid = counts as absence (0 hours)';

-- 2. Set existing seed data correctly
UPDATE public.leave_type_config SET pay_type = 'paid'   WHERE code IN ('vl', 'sl', 'pto', 'maternity', 'paternity');
UPDATE public.leave_type_config SET pay_type = 'unpaid' WHERE code = 'lwop';
