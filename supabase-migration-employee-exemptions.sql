-- ============================================================
-- B1G HRIS — Migration: Employee Exemptions
-- Overtime, Late, Undertime, Grace Period, Login, Night Differential
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS
-- ============================================================

-- Overtime Exempted: time out past shift end → auto-set to shift end time
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS overtime_exempted BOOLEAN DEFAULT false;

-- Late Exempted: time in late → auto-set to shift start time
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS late_exempted BOOLEAN DEFAULT false;

-- Night Differential Exempted: (hidden in UI for now)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS night_differential_exempted BOOLEAN DEFAULT false;

-- Undertime Exempted: same as late exempted
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS undertime_exempted BOOLEAN DEFAULT false;

-- Grace Period Exempted: same as late exempted
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS grace_period_exempted BOOLEAN DEFAULT false;

-- Login Exempted: does not require time in/out, always on time
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS login_exempted BOOLEAN DEFAULT false;
