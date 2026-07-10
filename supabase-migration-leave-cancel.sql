-- ============================================================
-- B1G HRIS — Leave Request Cancellation
-- Adds cancelled status, audit columns, cancel_leave_request RPC,
-- attendance sync trigger update, and in-app notification support.
-- Safe to re-run.
-- ============================================================

-- 1. Extend leave_status enum
-- ============================================================
ALTER TYPE public.leave_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Audit columns on leave_requests
-- ============================================================
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_note TEXT;

COMMENT ON COLUMN public.leave_requests.cancellation_note IS 'Required reason when a leave request is cancelled (separate from reason)';

-- 3. cancel_leave_request RPC
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

  IF public.has_role(v_canceller_id, 'super_admin') THEN
    NULL; -- super_admin may cancel pending or approved
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
      -- Custom/config-based types stored in balances JSONB
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

-- 4. Extend attendance sync trigger for cancelled status
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_leave_to_attendance_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.apply_approved_leave_to_attendance(NEW.id);
    ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
      DELETE FROM public.attendance_records WHERE leave_request_id = NEW.id;
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'approved' THEN
      DELETE FROM public.attendance_records WHERE leave_request_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Extend create_request_notifications for cancelled event (in-app only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_request_notifications(
  p_event TEXT,
  p_request_type TEXT,
  p_request_id UUID,
  p_approver_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_id UUID;
  v_user_ids UUID[] := ARRAY[]::UUID[];
  v_title TEXT;
  v_message TEXT;
  v_action_url TEXT := '/dashboard';
  v_type TEXT := p_request_type;
  v_requestor_name TEXT := 'Employee';
  v_approver_name TEXT := 'Approver';
  v_leave_start DATE;
  v_leave_end DATE;
  v_leave_type TEXT;
  v_ot_date DATE;
  v_ot_hours NUMERIC;
  v_bt_start DATE;
  v_bt_end DATE;
  v_bt_destination TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_event NOT IN ('submitted', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid event';
  END IF;
  IF p_request_type NOT IN ('leave', 'overtime', 'business_trip') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;

  IF p_request_type = 'leave' THEN
    SELECT lr.employee_id, lr.start_date, lr.end_date, lr.leave_type::text
    INTO v_emp_id, v_leave_start, v_leave_end, v_leave_type
    FROM public.leave_requests lr
    WHERE lr.id = p_request_id;
    v_action_url := '/dashboard/leave';
  ELSIF p_request_type = 'overtime' THEN
    SELECT ot.employee_id, ot.date, ot.hours
    INTO v_emp_id, v_ot_date, v_ot_hours
    FROM public.overtime_requests ot
    WHERE ot.id = p_request_id;
    v_action_url := '/dashboard/overtime';
  ELSE
    SELECT bt.employee_id, bt.start_date, bt.end_date, bt.destination
    INTO v_emp_id, v_bt_start, v_bt_end, v_bt_destination
    FROM public.business_trips bt
    WHERE bt.id = p_request_id;
    v_action_url := '/dashboard/business-trip';
  END IF;

  IF v_emp_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT CONCAT_WS(' ', e.first_name, e.last_name)
  INTO v_requestor_name
  FROM public.employees e
  WHERE e.id = v_emp_id;

  IF p_approver_id IS NOT NULL THEN
    SELECT CONCAT_WS(' ', e.first_name, e.last_name)
    INTO v_approver_name
    FROM public.employees e
    WHERE e.id = p_approver_id;
  END IF;

  IF p_event = 'submitted' OR (p_event = 'cancelled' AND p_approver_id = v_emp_id) THEN
    SELECT ARRAY(
      SELECT DISTINCT s_id FROM (
        SELECT es.supervisor_id AS s_id
        FROM public.employee_supervisors es
        WHERE es.employee_id = v_emp_id
        UNION ALL
        SELECT e.supervisor_id
        FROM public.employees e
        WHERE e.id = v_emp_id
        UNION ALL
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role IN ('admin', 'super_admin')
      ) z
      WHERE s_id IS NOT NULL
    ) INTO v_user_ids;

    IF p_event = 'submitted' THEN
      v_title := CASE p_request_type
        WHEN 'leave' THEN 'New Leave Request'
        WHEN 'overtime' THEN 'New Overtime Request'
        ELSE 'New Business Trip Request'
      END;
      v_message := CASE p_request_type
        WHEN 'leave' THEN format(
          '%s submitted a %s leave request on %s%s.',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          UPPER(COALESCE(v_leave_type, 'leave')),
          COALESCE(to_char(v_leave_start, 'Mon DD, YYYY'), 'Unknown date'),
          CASE
            WHEN v_leave_end IS NOT NULL AND v_leave_end <> v_leave_start
            THEN format(' to %s', to_char(v_leave_end, 'Mon DD, YYYY'))
            ELSE ''
          END
        )
        WHEN 'overtime' THEN format(
          '%s submitted an overtime request for %s%s.',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          COALESCE(to_char(v_ot_date, 'Mon DD, YYYY'), 'Unknown date'),
          CASE
            WHEN v_ot_hours IS NOT NULL THEN format(' (%s hr%s)', v_ot_hours, CASE WHEN v_ot_hours = 1 THEN '' ELSE 's' END)
            ELSE ''
          END
        )
        ELSE format(
          '%s submitted a business trip request for %s%s%s.',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          COALESCE(to_char(v_bt_start, 'Mon DD, YYYY'), 'Unknown date'),
          CASE
            WHEN v_bt_end IS NOT NULL AND v_bt_end <> v_bt_start
            THEN format(' to %s', to_char(v_bt_end, 'Mon DD, YYYY'))
            ELSE ''
          END,
          CASE
            WHEN COALESCE(v_bt_destination, '') <> '' THEN format(' (%s)', v_bt_destination)
            ELSE ''
          END
        )
      END;
    ELSE
      v_title := CASE p_request_type
        WHEN 'leave' THEN 'Leave Request Cancelled'
        WHEN 'overtime' THEN 'Overtime Request Cancelled'
        ELSE 'Business Trip Cancelled'
      END;
      v_message := CASE p_request_type
        WHEN 'leave' THEN format(
          '%s cancelled their %s leave request (%s%s).',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          UPPER(COALESCE(v_leave_type, 'leave')),
          COALESCE(to_char(v_leave_start, 'Mon DD, YYYY'), 'Unknown date'),
          CASE
            WHEN v_leave_end IS NOT NULL AND v_leave_end <> v_leave_start
            THEN format(' to %s', to_char(v_leave_end, 'Mon DD, YYYY'))
            ELSE ''
          END
        )
        WHEN 'overtime' THEN format(
          '%s cancelled their overtime request for %s.',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          COALESCE(to_char(v_ot_date, 'Mon DD, YYYY'), 'Unknown date')
        )
        ELSE format(
          '%s cancelled their business trip request for %s%s.',
          COALESCE(NULLIF(v_requestor_name, ''), 'Employee'),
          COALESCE(to_char(v_bt_start, 'Mon DD, YYYY'), 'Unknown date'),
          CASE
            WHEN v_bt_end IS NOT NULL AND v_bt_end <> v_bt_start
            THEN format(' to %s', to_char(v_bt_end, 'Mon DD, YYYY'))
            ELSE ''
          END
        )
      END;
    END IF;
  ELSE
    v_user_ids := ARRAY[v_emp_id];
    v_title := CASE p_request_type
      WHEN 'leave' THEN format('Leave Request %s', initcap(p_event))
      WHEN 'overtime' THEN format('Overtime Request %s', initcap(p_event))
      ELSE format('Business Trip %s', initcap(p_event))
    END;
    v_message := CASE p_request_type
      WHEN 'leave' THEN format(
        'Your %s leave request (%s%s) was %s by %s.',
        UPPER(COALESCE(v_leave_type, 'leave')),
        COALESCE(to_char(v_leave_start, 'Mon DD, YYYY'), 'Unknown date'),
        CASE
          WHEN v_leave_end IS NOT NULL AND v_leave_end <> v_leave_start
          THEN format(' to %s', to_char(v_leave_end, 'Mon DD, YYYY'))
          ELSE ''
        END,
        p_event,
        COALESCE(NULLIF(v_approver_name, ''), 'Approver')
      )
      WHEN 'overtime' THEN format(
        'Your overtime request for %s was %s by %s.',
        COALESCE(to_char(v_ot_date, 'Mon DD, YYYY'), 'Unknown date'),
        p_event,
        COALESCE(NULLIF(v_approver_name, ''), 'Approver')
      )
      ELSE format(
        'Your business trip request for %s%s was %s by %s.',
        COALESCE(to_char(v_bt_start, 'Mon DD, YYYY'), 'Unknown date'),
        CASE
          WHEN v_bt_end IS NOT NULL AND v_bt_end <> v_bt_start
          THEN format(' to %s', to_char(v_bt_end, 'Mon DD, YYYY'))
          ELSE ''
        END,
        p_event,
        COALESCE(NULLIF(v_approver_name, ''), 'Approver')
      )
    END;
  END IF;

  RETURN public._insert_user_notifications(
    v_user_ids,
    v_type,
    v_title,
    v_message,
    v_action_url,
    jsonb_build_object(
      'event', p_event,
      'request_type', p_request_type,
      'request_id', p_request_id,
      'approver_id', p_approver_id,
      'requestor_name', v_requestor_name,
      'approver_name', v_approver_name,
      'leave_start_date', v_leave_start,
      'leave_end_date', v_leave_end,
      'leave_type', v_leave_type,
      'overtime_date', v_ot_date,
      'overtime_hours', v_ot_hours,
      'trip_start_date', v_bt_start,
      'trip_end_date', v_bt_end,
      'trip_destination', v_bt_destination
    ),
    FALSE
  );
END;
$$;
