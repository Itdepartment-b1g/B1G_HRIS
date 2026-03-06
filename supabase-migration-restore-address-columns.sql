-- Restore address_in and address_out columns on attendance_records (if accidentally removed)
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS address_in TEXT,
  ADD COLUMN IF NOT EXISTS address_out TEXT;
