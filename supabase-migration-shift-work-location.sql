-- ============================================================
-- B1G HRIS — Migration: Link Shift to Work Location
-- Adds work_location_id FK on shifts table so each shift
-- knows which location to validate GPS against.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- Add work_location_id column to shifts (nullable — existing shifts keep working)
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS work_location_id UUID REFERENCES public.work_locations(id) ON DELETE SET NULL;

-- Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shifts_work_location_id ON public.shifts(work_location_id);
