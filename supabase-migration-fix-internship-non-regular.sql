-- ============================================================
-- B1G HRIS — Fix: Internship and other non-regular statuses
-- Sets is_regular = false for Internship, Probationary, Contract, etc.
-- Only "Regular" (and similar) should have is_regular = true.
-- Safe to re-run.
-- ============================================================

UPDATE public.employment_statuses
SET is_regular = false
WHERE LOWER(name) IN (
  'internship', 'intern', 'probationary', 'probation',
  'contract', 'contractual', 'consultant', 'project-based',
  'trainee', 'temporary', 'contractor'
);
