-- ============================================================
-- B1G HRIS — Leave Type Config & Eligibility
-- Master data for leave types: entitlement, annual reset, cap,
-- which employment statuses and genders are eligible.
-- Safe to re-run.
-- ============================================================

-- 1. LEAVE_TYPE_CONFIG: defines each leave type
CREATE TABLE IF NOT EXISTS public.leave_type_config (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  annual_entitlement  NUMERIC(5,2) NOT NULL DEFAULT 0,
  resets_on_jan1     BOOLEAN NOT NULL DEFAULT true,
  cap                NUMERIC(5,2),
  sort_order         INT NOT NULL DEFAULT 0,
  is_system          BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.leave_type_config.code IS 'Leave type code (vl, sl, pto, lwop, maternity, paternity, etc.)';
COMMENT ON COLUMN public.leave_type_config.annual_entitlement IS 'Days credited each Jan 1 when resets_on_jan1=true';
COMMENT ON COLUMN public.leave_type_config.cap IS 'Max balance (null = no cap)';
COMMENT ON COLUMN public.leave_type_config.is_system IS 'System types (vl, sl, pto, lwop) cannot be deleted';

-- 2. LEAVE_TYPE_ELIGIBILITY: who gets each leave type
CREATE TABLE IF NOT EXISTS public.leave_type_eligibility (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_config_id  UUID NOT NULL REFERENCES public.leave_type_config(id) ON DELETE CASCADE,
  employment_status_id UUID NOT NULL REFERENCES public.employment_statuses(id) ON DELETE CASCADE,
  gender_filter        TEXT NOT NULL DEFAULT 'all' CHECK (gender_filter IN ('all', 'male', 'female')),
  created_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(leave_type_config_id, employment_status_id, gender_filter)
);

-- 3. RLS
ALTER TABLE public.leave_type_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_type_eligibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated read leave_type_config" ON public.leave_type_config;
CREATE POLICY "All authenticated read leave_type_config"
  ON public.leave_type_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage leave_type_config" ON public.leave_type_config;
CREATE POLICY "Admins manage leave_type_config"
  ON public.leave_type_config FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "All authenticated read leave_type_eligibility" ON public.leave_type_eligibility;
CREATE POLICY "All authenticated read leave_type_eligibility"
  ON public.leave_type_eligibility FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage leave_type_eligibility" ON public.leave_type_eligibility;
CREATE POLICY "Admins manage leave_type_eligibility"
  ON public.leave_type_eligibility FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. Seed default configs (VL, SL, PTO, LWOP)
INSERT INTO public.leave_type_config (code, name, description, annual_entitlement, resets_on_jan1, cap, sort_order, is_system)
VALUES
  ('vl', 'Vacation Leave', 'Annual vacation leave', 15, true, 30, 1, true),
  ('sl', 'Sick Leave', 'Medical/sick leave', 15, true, null, 2, true),
  ('pto', 'Personal Time Off', 'Personal leave', 7, true, null, 3, true),
  ('lwop', 'Leave Without Pay', 'Unpaid leave', 0, false, null, 4, true),
  ('maternity', 'Maternity Leave', 'Paid maternity leave', 105, false, null, 5, false),
  ('paternity', 'Paternity Leave', 'Paid paternity leave', 7, false, null, 6, false)
ON CONFLICT (code) DO NOTHING;

-- 5. Seed eligibility: VL/SL/PTO for Regular (all genders), Maternity for Regular (female), Paternity for Regular (male), LWOP for all statuses
DO $$
DECLARE
  v_regular_id UUID;
  v_status RECORD;
  v_vl_id UUID;
  v_sl_id UUID;
  v_pto_id UUID;
  v_lwop_id UUID;
  v_mat_id UUID;
  v_pat_id UUID;
BEGIN
  SELECT id INTO v_regular_id FROM public.employment_statuses WHERE LOWER(name) = 'regular' LIMIT 1;
  SELECT id INTO v_vl_id FROM public.leave_type_config WHERE code = 'vl' LIMIT 1;
  SELECT id INTO v_sl_id FROM public.leave_type_config WHERE code = 'sl' LIMIT 1;
  SELECT id INTO v_pto_id FROM public.leave_type_config WHERE code = 'pto' LIMIT 1;
  SELECT id INTO v_lwop_id FROM public.leave_type_config WHERE code = 'lwop' LIMIT 1;
  SELECT id INTO v_mat_id FROM public.leave_type_config WHERE code = 'maternity' LIMIT 1;
  SELECT id INTO v_pat_id FROM public.leave_type_config WHERE code = 'paternity' LIMIT 1;

  IF v_regular_id IS NOT NULL AND v_vl_id IS NOT NULL THEN
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_vl_id, v_regular_id, 'all')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END IF;
  IF v_regular_id IS NOT NULL AND v_sl_id IS NOT NULL THEN
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_sl_id, v_regular_id, 'all')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END IF;
  IF v_regular_id IS NOT NULL AND v_pto_id IS NOT NULL THEN
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_pto_id, v_regular_id, 'all')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END IF;
  IF v_regular_id IS NOT NULL AND v_mat_id IS NOT NULL THEN
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_mat_id, v_regular_id, 'female')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END IF;
  IF v_regular_id IS NOT NULL AND v_pat_id IS NOT NULL THEN
    INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
    VALUES (v_pat_id, v_regular_id, 'male')
    ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
  END IF;

  -- LWOP: all employment statuses (regular and non-regular)
  IF v_lwop_id IS NOT NULL THEN
    FOR v_status IN SELECT id FROM public.employment_statuses
    LOOP
      INSERT INTO public.leave_type_eligibility (leave_type_config_id, employment_status_id, gender_filter)
      VALUES (v_lwop_id, v_status.id, 'all')
      ON CONFLICT (leave_type_config_id, employment_status_id, gender_filter) DO NOTHING;
    END LOOP;
  END IF;
END $$;
