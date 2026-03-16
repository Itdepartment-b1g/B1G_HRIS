-- ============================================================
-- B1G HRIS — Activity Module (Survey, Announcements, Policies)
-- Extends announcements, adds surveys, policies, acknowledgements
-- Safe to re-run.
-- ============================================================

-- 1. EXTEND ANNOUNCEMENTS
-- ============================================================
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS publish_date DATE;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS target_employee_ids UUID[] DEFAULT '{}';

-- Backfill publish_date for existing rows
UPDATE public.announcements
SET publish_date = COALESCE(created_at::date, CURRENT_DATE)
WHERE publish_date IS NULL;

ALTER TABLE public.announcements ALTER COLUMN publish_date SET DEFAULT CURRENT_DATE;
ALTER TABLE public.announcements ALTER COLUMN publish_date SET NOT NULL;

-- 2. ANNOUNCEMENT ACKNOWLEDGEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, employee_id)
);

ALTER TABLE public.announcement_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read announcement acknowledgements"
  ON public.announcement_acknowledgements FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Insert own acknowledgement"
  ON public.announcement_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- 3. SURVEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  target_audience TEXT DEFAULT 'all',
  target_employee_ids UUID[] DEFAULT '{}',
  is_anonymous BOOLEAN DEFAULT false,
  author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage surveys"
  ON public.surveys FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Employees read active surveys"
  ON public.surveys FOR SELECT
  TO authenticated
  USING (
    start_date <= CURRENT_DATE
    AND end_date >= CURRENT_DATE
    AND (
      target_audience = 'all'
      OR (target_audience = 'selected' AND auth.uid() = ANY(target_employee_ids))
    )
  );

-- 4. SURVEY QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('multiple_choice', 'rating', 'text')),
  options JSONB DEFAULT '[]'
);

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read questions for accessible surveys"
  ON public.survey_questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
      AND (
        public.is_admin(auth.uid())
        OR (s.start_date <= CURRENT_DATE AND s.end_date >= CURRENT_DATE
            AND (s.target_audience = 'all' OR (s.target_audience = 'selected' AND auth.uid() = ANY(s.target_employee_ids))))
      )
    )
  );

CREATE POLICY "Admins manage survey questions"
  ON public.survey_questions FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. SURVEY RESPONSES (employee_id nullable for anonymous)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,
  responded_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_response_unique_non_anon
  ON public.survey_responses (survey_id, employee_id)
  WHERE employee_id IS NOT NULL;

CREATE POLICY "Admins read all survey responses"
  ON public.survey_responses FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Insert own response or anonymous"
  ON public.survey_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_id
      AND s.start_date <= CURRENT_DATE
      AND s.end_date >= CURRENT_DATE
      AND (s.target_audience = 'all' OR (s.target_audience = 'selected' AND auth.uid() = ANY(s.target_employee_ids)))
      AND (
        (s.is_anonymous AND employee_id IS NULL)
        OR (NOT s.is_anonymous AND employee_id = auth.uid())
      )
    )
  );

-- 6. SURVEY ANSWERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.survey_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_rating INT,
  answer_choice TEXT
);

ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read answers via accessible responses"
  ON public.survey_answers FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.survey_responses sr
      WHERE sr.id = response_id
      AND (sr.employee_id = auth.uid() OR sr.employee_id IS NULL)
    )
  );

CREATE POLICY "Insert answers for own response"
  ON public.survey_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.survey_responses sr
      WHERE sr.id = response_id
      AND (sr.employee_id = auth.uid() OR sr.employee_id IS NULL)
    )
  );

-- 6b. SURVEY COMPLETIONS (tracks who completed anonymous surveys for time-out blocking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.survey_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(survey_id, employee_id)
);

ALTER TABLE public.survey_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read survey completions"
  ON public.survey_completions FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Insert own completion"
  ON public.survey_completions FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- 7. POLICIES (company policies)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  effective_date DATE NOT NULL,
  attachment_url TEXT,
  target_audience TEXT DEFAULT 'all',
  target_employee_ids UUID[] DEFAULT '{}',
  author_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage policies"
  ON public.policies FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Employees read effective policies"
  ON public.policies FOR SELECT
  TO authenticated
  USING (
    effective_date <= CURRENT_DATE
    AND (
      target_audience = 'all'
      OR (target_audience = 'selected' AND auth.uid() = ANY(target_employee_ids))
    )
  );

-- 8. POLICY ACKNOWLEDGEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.policy_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(policy_id, employee_id)
);

ALTER TABLE public.policy_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read policy acknowledgements"
  ON public.policy_acknowledgements FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Insert own policy acknowledgement"
  ON public.policy_acknowledgements FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- 9. STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('announcement-attachments', 'announcement-attachments', true),
  ('policy-attachments', 'policy-attachments', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated upload announcement attachments" ON storage.objects;
CREATE POLICY "Authenticated upload announcement attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated view announcement attachments" ON storage.objects;
CREATE POLICY "Authenticated view announcement attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'announcement-attachments');

DROP POLICY IF EXISTS "Authenticated upload policy attachments" ON storage.objects;
CREATE POLICY "Authenticated upload policy attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'policy-attachments'
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated view policy attachments" ON storage.objects;
CREATE POLICY "Authenticated view policy attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'policy-attachments');

-- 10. DELETE POLICIES (admins can delete announcements, policies, surveys)
-- ============================================================
CREATE POLICY "Admins delete announcements"
  ON public.announcements FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete policies"
  ON public.policies FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- surveys already has "Admins manage surveys" FOR ALL which includes DELETE

-- 11. RPC: Pending activity counts for compliance (time-out blocking)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_activity_compliance(_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
  unack_announcements INT;
  unack_policies INT;
  pending_surveys INT;
BEGIN
  -- Unacknowledged announcements (within publish/expiration, target includes user)
  SELECT COUNT(*)::INT INTO unack_announcements
  FROM public.announcements a
  WHERE a.publish_date <= today_date
    AND (a.expiration_date IS NULL OR a.expiration_date >= today_date)
    AND (a.target_audience = 'all' OR _user_id = ANY(a.target_employee_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.announcement_acknowledgements aa
      WHERE aa.announcement_id = a.id AND aa.employee_id = _user_id
    );

  -- Unacknowledged policies (effective, target includes user)
  SELECT COUNT(*)::INT INTO unack_policies
  FROM public.policies p
  WHERE p.effective_date <= today_date
    AND (p.target_audience = 'all' OR _user_id = ANY(p.target_employee_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.policy_acknowledgements pa
      WHERE pa.policy_id = p.id AND pa.employee_id = _user_id
    );

  -- Active surveys where user has not completed (response or completion for anonymous)
  SELECT COUNT(*)::INT INTO pending_surveys
  FROM public.surveys s
  WHERE s.start_date <= today_date
    AND s.end_date >= today_date
    AND (s.target_audience = 'all' OR _user_id = ANY(s.target_employee_ids))
    AND (
      (s.is_anonymous AND NOT EXISTS (SELECT 1 FROM public.survey_completions sc WHERE sc.survey_id = s.id AND sc.employee_id = _user_id))
      OR (NOT s.is_anonymous AND NOT EXISTS (SELECT 1 FROM public.survey_responses sr WHERE sr.survey_id = s.id AND sr.employee_id = _user_id))
    );

  RETURN json_build_object(
    'announcements', unack_announcements,
    'policies', unack_policies,
    'surveys', pending_surveys,
    'can_time_out', (unack_announcements = 0 AND unack_policies = 0 AND pending_surveys = 0)
  );
END;
$$;
