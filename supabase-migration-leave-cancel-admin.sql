-- ============================================================
-- B1G HRIS — Allow admin (not only super_admin) to cancel leave
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_leave_request(
  p_leave_id UUID,
  p_cancellation_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_canceller_id UUID := auth.uid();
  v_year INT;
  v_note TEXT;
  v_leave_code TEXT;
BEGIN
  IF v_canceller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_note := trim(COALESCE(p_cancellation_note, ''));
  IF v_note = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cancellation note is required');
  END IF;

  SELECT lr.* INTO v_rec
  FROM public.leave_requests lr
  WHERE lr.id = p_leave_id
    AND lr.status IN ('pending', 'approved');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leave request not found or cannot be cancelled');
  END IF;

  IF public.is_admin(v_canceller_id) THEN
    NULL; -- admin and super_admin may cancel pending or approved
  ELSIF v_rec.employee_id = v_canceller_id AND v_rec.status = 'pending' THEN
    NULL; -- employee may cancel own pending only
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to cancel this request');
  END IF;

  v_leave_code := v_rec.leave_type::text;

  IF v_rec.status = 'approved' THEN
    v_year := EXTRACT(YEAR FROM v_rec.start_date)::int;

    IF v_leave_code IN ('vl', 'vacation') THEN
      UPDATE public.leave_balances
      SET vl_balance = vl_balance + COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_leave_code IN ('sl', 'sick') THEN
      UPDATE public.leave_balances
      SET sl_balance = sl_balance + COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_leave_code IN ('pto', 'personal') THEN
      UPDATE public.leave_balances
      SET pto_balance = pto_balance + COALESCE(v_rec.number_of_days, 0), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSIF v_leave_code = 'lwop' THEN
      UPDATE public.leave_balances
      SET lwop_days_used = GREATEST(0, lwop_days_used - COALESCE(v_rec.number_of_days, 0)), updated_at = now()
      WHERE employee_id = v_rec.employee_id AND year = v_year;
    ELSE
      UPDATE public.leave_balances
      SET balances = jsonb_set(
            COALESCE(balances, '{}'::jsonb),
            ARRAY[v_leave_code],
            to_jsonb(
              ROUND(
                (COALESCE((balances ->> v_leave_code)::numeric, 0) + COALESCE(v_rec.number_of_days, 0))::numeric,
                2
              )
            )
          ),
          updated_at = now()
      WHERE employee_id = v_rec.employee_id
        AND year = v_year
        AND COALESCE(balances ? v_leave_code, false);
    END IF;

    DELETE FROM public.attendance_records WHERE leave_request_id = p_leave_id;
  END IF;

  UPDATE public.leave_requests
  SET status = 'cancelled'::public.leave_status,
      cancelled_by = v_canceller_id,
      cancelled_at = now(),
      cancellation_note = v_note,
      updated_at = now()
  WHERE id = p_leave_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_leave_request(UUID, TEXT) TO authenticated;
