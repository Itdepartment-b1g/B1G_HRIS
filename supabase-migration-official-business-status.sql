-- ============================================================
-- B1G HRIS — Add Official Business (OB) attendance status
-- Safe to re-run.
-- ============================================================

ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'official_business';
