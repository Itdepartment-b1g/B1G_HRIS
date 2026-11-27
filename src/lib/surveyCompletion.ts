import { supabase } from '@/lib/supabase';
import { serializeAnswerChoice } from '@/lib/surveyAnswers';
import type { SurveyQuestion } from '@/types';

export type SurveyAnswerValue = string | number | string[];

/** True if this employee already completed the survey (named response or anonymous completion). */
export async function userAlreadyTookSurvey(
  surveyId: string,
  employeeId: string
): Promise<boolean> {
  const [{ data: resp }, { data: comp }] = await Promise.all([
    supabase
      .from('survey_responses')
      .select('id')
      .eq('survey_id', surveyId)
      .eq('employee_id', employeeId)
      .limit(1),
    supabase
      .from('survey_completions')
      .select('id')
      .eq('survey_id', surveyId)
      .eq('employee_id', employeeId)
      .limit(1),
  ]);
  return (resp?.length ?? 0) > 0 || (comp?.length ?? 0) > 0;
}

/**
 * Insert response + answers. For anonymous surveys, records survey_completions first
 * so a unique constraint blocks a second attempt before another anonymous response is created.
 */
export async function submitSurveyResponse(opts: {
  surveyId: string;
  employeeId: string;
  isAnonymous: boolean;
  questions: SurveyQuestion[];
  answers: Record<string, SurveyAnswerValue>;
}): Promise<{ error: string | null }> {
  const { surveyId, employeeId, isAnonymous, questions, answers } = opts;

  if (await userAlreadyTookSurvey(surveyId, employeeId)) {
    return { error: 'You have already completed this survey.' };
  }

  // Anonymous: claim completion first (UNIQUE on survey_id + employee_id).
  if (isAnonymous) {
    const { error: compErr } = await supabase
      .from('survey_completions')
      .insert({ survey_id: surveyId, employee_id: employeeId });
    if (compErr) {
      if (compErr.code === '23505') {
        return { error: 'You have already completed this survey.' };
      }
      return { error: compErr.message };
    }
  }

  const { data: respRow, error: respErr } = await supabase
    .from('survey_responses')
    .insert({
      survey_id: surveyId,
      employee_id: isAnonymous ? null : employeeId,
    })
    .select('id')
    .single();

  if (respErr) {
    if (respErr.code === '23505') {
      return { error: 'You have already completed this survey.' };
    }
    return { error: respErr.message };
  }

  const answerRows = questions.map((q) => {
    const v = answers[q.id];
    return {
      response_id: respRow.id,
      question_id: q.id,
      answer_text: q.answer_type === 'text' ? String(v) : null,
      answer_rating: q.answer_type === 'rating' ? (v as number) : null,
      answer_choice: serializeAnswerChoice(q.answer_type, v),
    };
  });

  const { error: ansErr } = await supabase.from('survey_answers').insert(answerRows);
  if (ansErr) {
    return { error: ansErr.message };
  }

  return { error: null };
}
