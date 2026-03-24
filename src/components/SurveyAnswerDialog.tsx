import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SurveyQuestion } from '@/types';

interface SurveyAnswerDialogProps {
  surveyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SurveyAnswerDialog({
  surveyId,
  open,
  onOpenChange,
  onSuccess,
}: SurveyAnswerDialogProps) {
  const [survey, setSurvey] = useState<{ id: string; title: string; description?: string | null; is_anonymous?: boolean } | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !surveyId) {
      setSurvey(null);
      setQuestions([]);
      setAnswers({});
      return;
    }
    const load = async () => {
      setLoading(true);
      const [surveyRes, questionsRes] = await Promise.all([
        supabase.from('surveys').select('id, title, description, is_anonymous').eq('id', surveyId).single(),
        supabase.from('survey_questions').select('*').eq('survey_id', surveyId).order('sort_order'),
      ]);
      setSurvey(surveyRes.data || null);
      setQuestions((questionsRes.data || []) as SurveyQuestion[]);
      setAnswers({});
      setLoading(false);
    };
    load();
  }, [open, surveyId]);

  const handleSubmit = async () => {
    if (!survey || !surveyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const employeeId = user?.id;
    if (!employeeId) return;

    const missing = questions.filter((q) => answers[q.id] === undefined || answers[q.id] === '');
    if (missing.length > 0) {
      toast.error('Please answer all questions.');
      return;
    }

    setSubmitting(true);
    const { data: respRow, error: respErr } = await supabase
      .from('survey_responses')
      .insert({
        survey_id: surveyId,
        employee_id: survey.is_anonymous ? null : employeeId,
      })
      .select('id')
      .single();

    if (respErr) {
      toast.error(respErr.message);
      setSubmitting(false);
      return;
    }

    if (survey.is_anonymous) {
      await supabase.from('survey_completions').insert({ survey_id: surveyId, employee_id: employeeId });
    }

    const answerRows = questions.map((q) => {
      const v = answers[q.id];
      return {
        response_id: respRow.id,
        question_id: q.id,
        answer_text: q.answer_type === 'text' ? String(v) : null,
        answer_rating: q.answer_type === 'rating' ? (v as number) : null,
        answer_choice: q.answer_type === 'multiple_choice' ? String(v) : null,
      };
    });
    const { error: ansErr } = await supabase.from('survey_answers').insert(answerRows);

    if (ansErr) {
      toast.error(ansErr.message);
      setSubmitting(false);
      return;
    }

    toast.success('Survey submitted.');
    onSuccess?.();
    onOpenChange(false);
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{survey?.title}</DialogTitle>
          {survey?.description && (
            <DialogDescription>{survey.description}</DialogDescription>
          )}
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-6 py-4">
              {questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <Label>
                    {q.question_text}
                    {q.answer_type === 'rating' && ' (1-5)'}
                  </Label>
                  {q.answer_type === 'multiple_choice' && (
                    <RadioGroup
                      value={String(answers[q.id] ?? '')}
                      onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                    >
                      {(q.options as string[] || []).map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`${q.id}-${i}`} />
                          <Label htmlFor={`${q.id}-${i}`} className="font-normal cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                  {q.answer_type === 'rating' && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Button
                          key={n}
                          type="button"
                          variant={answers[q.id] === n ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                        >
                          <Star className={cn('h-4 w-4', answers[q.id] === n && 'fill-current')} />
                          {n}
                        </Button>
                      ))}
                    </div>
                  )}
                  {q.answer_type === 'text' && (
                    <Textarea
                      value={String(answers[q.id] ?? '')}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Your answer"
                      rows={3}
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
