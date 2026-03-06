-- Add photo capture, remarks, and minutes_late to attendance_records
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS time_in_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS time_out_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS minutes_late INTEGER DEFAULT 0;
