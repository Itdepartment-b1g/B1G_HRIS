-- ============================================================
-- In-app Notifications (Bell + Popup single source)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('leave', 'business_trip', 'overtime', 'survey', 'announcement', 'policy')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  requires_ack BOOLEAN NOT NULL DEFAULT FALSE,
  is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread_created
  ON public.user_notifications (user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_ack_pending_created
  ON public.user_notifications (user_id, requires_ack, is_acknowledged, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications (user_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_notifications' AND policyname = 'Users read own notifications'
  ) THEN
    CREATE POLICY "Users read own notifications"
      ON public.user_notifications
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_notifications' AND policyname = 'Users update own notifications'
  ) THEN
    CREATE POLICY "Users update own notifications"
      ON public.user_notifications
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Generic secure inserter used by RPCs below
CREATE OR REPLACE FUNCTION public._insert_user_notifications(
  p_user_ids UUID[],
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_requires_ack BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.user_notifications (
    user_id, type, title, message, action_url, metadata, requires_ack
  )
  SELECT DISTINCT
    u.user_id, p_type, p_title, p_message, p_action_url, COALESCE(p_metadata, '{}'::jsonb), p_requires_ack
  FROM unnest(p_user_ids) AS u(user_id)
  WHERE u.user_id IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Request notifications (leave / overtime / business trip)
CREATE OR REPLACE FUNCTION public.create_request_notifications(
  p_event TEXT, -- submitted | approved | rejected
  p_request_type TEXT, -- leave | overtime | business_trip
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
  IF p_event NOT IN ('submitted', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid event';
  END IF;
  IF p_request_type NOT IN ('leave', 'overtime', 'business_trip') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;

  IF p_request_type = 'leave' THEN
    SELECT lr.employee_id, lr.start_date, lr.end_date, lr.leave_type
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

  IF p_event = 'submitted' THEN
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

-- Activity notifications (announcement / policy / survey)
CREATE OR REPLACE FUNCTION public.create_activity_notifications(
  p_type TEXT, -- announcement | policy | survey
  p_title TEXT,
  p_message TEXT,
  p_action_url TEXT,
  p_target_audience TEXT DEFAULT 'all',
  p_target_employee_ids UUID[] DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_requires_ack BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_ids UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_type NOT IN ('announcement', 'policy', 'survey') THEN
    RAISE EXCEPTION 'Invalid activity type';
  END IF;

  IF p_target_audience = 'selected' THEN
    v_user_ids := COALESCE(p_target_employee_ids, ARRAY[]::UUID[]);
  ELSE
    SELECT ARRAY_AGG(e.id) INTO v_user_ids
    FROM public.employees e
    WHERE e.is_active = TRUE;
  END IF;

  RETURN public._insert_user_notifications(
    v_user_ids,
    p_type,
    p_title,
    p_message,
    p_action_url,
    p_metadata,
    p_requires_ack
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_request_notifications(TEXT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity_notifications(TEXT, TEXT, TEXT, TEXT, TEXT, UUID[], JSONB, BOOLEAN) TO authenticated;
