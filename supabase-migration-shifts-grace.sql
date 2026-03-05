-- ============================================================
-- B1G HRIS — Migration: Shift Grace Period
-- Minutes after shift start before marking late (e.g. 15 = time in up to 8:15 is OK when start is 8:00)
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 15;
