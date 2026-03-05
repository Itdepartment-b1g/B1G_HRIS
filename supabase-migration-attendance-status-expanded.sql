-- Add ETI, LTI, ETO, LTO to attendance_status enum
ALTER TYPE public.attendance_status ADD VALUE 'eti';
ALTER TYPE public.attendance_status ADD VALUE 'lti';
ALTER TYPE public.attendance_status ADD VALUE 'eto';
ALTER TYPE public.attendance_status ADD VALUE 'lto';
