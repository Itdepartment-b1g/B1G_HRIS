-- ============================================================
-- B1G HRIS — OT Approval Credits CTO Leave Balance
-- When supervisor approves an overtime request, credit OT hours
-- to employee's CTO balance. 8 OT hours = 1 CTO day.
-- Requires: overtime_requests, leave_balances, leave_type_config
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_overtime_request(
  p_ot_id UUID,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_approver_id UUID := auth.uid();
  v_year INT;
  v_cto_days NUMERIC(5,2);
  v_has_cto BOOLEAN;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT * INTO v_rec
  FROM overtime_requests
  WHERE id = p_ot_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OT request not found or not pending');
  END IF;

  IF NOT (
    public.is_admin(v_approver_id)
    OR public.is_supervisor_of(v_approver_id, v_rec.employee_id)
    OR public.is_approver_of(v_approver_id, v_rec.employee_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to approve this request');
  END IF;

  -- On approval: credit OT hours to CTO leave balance first (8h = 1 day)
  -- Do this before updating OT status so any failure rolls back the whole transaction
  IF p_action = 'approved' AND COALESCE(v_rec.hours, 0) > 0 THEN
    SELECT EXISTS (SELECT 1 FROM leave_type_config WHERE code = 'cto') INTO v_has_cto;
    IF v_has_cto THEN
      v_year := EXTRACT(YEAR FROM v_rec.date)::int;
      v_cto_days := ROUND((v_rec.hours / 8)::numeric, 2);

      INSERT INTO leave_balances (employee_id, year, vl_balance, sl_balance, pto_balance, lwop_days_used, balances)
      VALUES (v_rec.employee_id, v_year, 15, 15, 7, 0, jsonb_build_object('cto', v_cto_days))
      ON CONFLICT (employee_id, year) DO UPDATE SET
        balances = jsonb_set(
          COALESCE(leave_balances.balances, '{}'),
          '{cto}',
          to_jsonb(ROUND((COALESCE((leave_balances.balances->>'cto')::numeric, 0) + v_cto_days)::numeric, 2))
        ),
        updated_at = now();
    END IF;
  END IF;

  UPDATE overtime_requests
  SET status = p_action::overtime_status,
      approved_by = v_approver_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_ot_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
