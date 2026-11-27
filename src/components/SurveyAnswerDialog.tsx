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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { submitSurveyResponse, type SurveyAnswerValue } from '@/lib/surveyCompletion';
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
  const [answers, setAnswers] = useState<Record<string, SurveyAnswerValue>>({});
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

  const isAnswerMissing = (q: SurveyQuestion) => {
    const v = answers[q.id];
    if (q.answer_type === 'checkbox') {
      return !Array.isArray(v) || v.length === 0;
    }
    return v === undefined || v === '';
  };

  const toggleCheckboxAnswer = (questionId: string, option: string, checked: boolean) => {
    setAnswers((a) => {
      const current = Array.isArray(a[questionId]) ? (a[questionId] as string[]) : [];
      const next = checked
        ? current.includes(option) ? current : [...current, option]
        : current.filter((o) => o !== option);
      return { ...a, [questionId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!survey || !surveyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const employeeId = user?.id;
    if (!employeeId) return;

    const missing = questions.filter(isAnswerMissing);
    if (missing.length > 0) {
      toast.error('Please answer all questions.');
      return;
    }

    setSubmitting(true);
    const { error } = await submitSurveyResponse({
      surveyId,
      employeeId,
      isAnonymous: !!survey.is_anonymous,
      questions,
      answers,
    });

    if (error) {
      toast.error(error);
      setSubmitting(false);
      if (error.includes('already completed')) {
        onSuccess?.();
        onOpenChange(false);
      }
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
                    {q.answer_type === 'checkbox' && ' (select all that apply)'}
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
                  {q.answer_type === 'checkbox' && (
                    <div className="space-y-2">
                      {(q.options as string[] || []).map((opt, i) => {
                        const selected = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <Checkbox
                              id={`${q.id}-cb-${i}`}
                              checked={selected.includes(opt)}
                              onCheckedChange={(v) => toggleCheckboxAnswer(q.id, opt, v === true)}
                            />
                            <Label htmlFor={`${q.id}-cb-${i}`} className="font-normal cursor-pointer">{opt}</Label>
                          </div>
                        );
                      })}
                    </div>
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
