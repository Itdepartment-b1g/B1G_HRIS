-- ============================================================
-- B1G HRIS — Migration: Shift Break Times & Grace Period
-- Adds break start, end, total hours, and grace period to shifts table
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_start_time TIME;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_end_time TIME;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS break_total_hours NUMERIC(4,2);

-- Grace period: minutes after shift start before marking late (e.g. 15 = time in up to start+15min is OK)
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15;
