-- Allow checkbox (multi-select) survey questions.
-- Selected options are stored as a JSON array string in survey_answers.answer_choice.

ALTER TABLE public.survey_questions
  DROP CONSTRAINT IF EXISTS survey_questions_answer_type_check;

ALTER TABLE public.survey_questions
  ADD CONSTRAINT survey_questions_answer_type_check
  CHECK (answer_type IN ('multiple_choice', 'checkbox', 'rating', 'text'));
