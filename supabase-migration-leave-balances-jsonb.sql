-- ============================================================
-- B1G HRIS — Leave Balances: JSONB for Config-Based Types
-- Adds balances JSONB for paternity, maternity, and other types from leave_type_config.
-- vl, sl, pto, lwop stay in fixed columns for backward compatibility.
-- Safe to re-run.
-- ============================================================

ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS balances JSONB DEFAULT '{}';

COMMENT ON COLUMN public.leave_balances.balances IS 'Dynamic leave balances by code, e.g. {"paternity": 7, "maternity": 0}. Used for types from leave_type_config beyond vl/sl/pto/lwop.';
