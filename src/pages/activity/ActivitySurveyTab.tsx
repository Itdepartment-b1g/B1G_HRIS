import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, ClipboardList, Star, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Survey, SurveyQuestion, SurveyAnswerType } from '@/types';

const ANSWER_TYPES: { value: SurveyAnswerType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'rating', label: 'Rating (1-5)' },
  { value: 'text', label: 'Text' },
];

const ActivitySurveyTab = () => {
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const isAdmin = currentUser?.roles?.some((r) => ['super_admin', 'admin'].includes(r));

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [answerSurvey, setAnswerSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [myResponses, setMyResponses] = useState<Set<string>>(new Set());
  const [employees, setEmployees] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);

  const today = format(new Date(), 'yyyy-MM-dd');

  const [form, setForm] = useState({
    title: '',
    description: '',
    start_date: today,
    end_date: today,
    target_audience: 'all' as 'all' | 'selected',
    target_employee_ids: [] as string[],
    is_anonymous: false,
    questions: [] as Array<{ question_text: string; answer_type: SurveyAnswerType; options: string[] }>,
  });

  const fetchSurveys = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    const rows = (data || []) as Survey[];
    const filtered = isAdmin ? rows : rows.filter((s) => {
      if (s.start_date > today || s.end_date < today) return false;
      if (s.target_audience === 'selected' && s.target_employee_ids?.length) {
        if (!s.target_employee_ids.includes(currentUser.id)) return false;
      }
      return true;
    });

    const { data: respData } = await supabase
      .from('survey_responses')
      .select('survey_id')
      .eq('employee_id', currentUser.id);
    const respondedIds = new Set((respData || []).map((r) => r.survey_id));

    const { data: compData } = await supabase
      .from('survey_completions')
      .select('survey_id')
      .eq('employee_id', currentUser.id);
    const completedIds = new Set((compData || []).map((r) => r.survey_id));

    const combined = new Set([...respondedIds, ...completedIds]);
    setMyResponses(combined);
    setSurveys(filtered);
  }, [currentUser?.id, today, isAdmin]);

  useEffect(() => {
    fetchSurveys().finally(() => setLoading(false));
  }, [fetchSurveys]);

  // Realtime: refetch when user completes a survey (from this page, popup, or dashboard)
  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel('survey-page-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'survey_responses',
          filter: `employee_id=eq.${currentUser.id}`,
        },
        () => fetchSurveys()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'survey_completions',
          filter: `employee_id=eq.${currentUser.id}`,
        },
        () => fetchSurveys()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchSurveys]);

  useEffect(() => {
    if (isAdmin) {
      supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name')
        .then(({ data }) => setEmployees(data || []));
    }
  }, [isAdmin]);

  const handleOpenAnswer = async (survey: Survey) => {
    const { data } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', survey.id)
      .order('sort_order');
    setQuestions((data || []) as SurveyQuestion[]);
    setAnswers({});
    setAnswerSurvey(survey);
  };

  const handleSubmitAnswer = async () => {
    if (!answerSurvey || !currentUser?.id) return;
    const survey = answerSurvey;
    const qIds = questions.map((q) => q.id);
    const missing = qIds.filter((id) => answers[id] === undefined || answers[id] === '');
    if (missing.length > 0) {
      toast.error('Please answer all questions.');
      return;
    }
    setSubmitting(true);

    const { data: respRow, error: respErr } = await supabase
      .from('survey_responses')
      .insert({
        survey_id: survey.id,
        employee_id: survey.is_anonymous ? null : currentUser.id,
      })
      .select('id')
      .single();

    if (respErr) {
      toast.error(respErr.message);
      setSubmitting(false);
      return;
    }

    if (survey.is_anonymous) {
      await supabase.from('survey_completions').insert({ survey_id: survey.id, employee_id: currentUser.id });
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
    setAnswerSurvey(null);
    fetchSurveys();
    refetchCompliance();
    setSubmitting(false);
  };

  const openCreate = async (editRow?: Survey) => {
    if (editRow) {
      setEditingId(editRow.id);
      const { data: qData } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', editRow.id)
        .order('sort_order');
      const qs = (qData || []) as SurveyQuestion[];
      setForm({
        title: editRow.title,
        description: editRow.description || '',
        start_date: editRow.start_date,
        end_date: editRow.end_date,
        target_audience: editRow.target_audience || 'all',
        target_employee_ids: editRow.target_employee_ids || [],
        is_anonymous: editRow.is_anonymous ?? false,
        questions: qs.map((q) => ({
          question_text: q.question_text,
          answer_type: q.answer_type as SurveyAnswerType,
          options: (q.options as string[]) || [],
        })),
      });
    } else {
      setEditingId(null);
      setForm({
        title: '',
        description: '',
        start_date: today,
        end_date: today,
        target_audience: 'all',
        target_employee_ids: [],
        is_anonymous: false,
        questions: [],
      });
    }
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!currentUser?.id || !form.title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (form.questions.length === 0) {
      toast.error('Add at least one question.');
      return;
    }
    setSubmitting(true);

    if (editingId) {
      const { error: surveyErr } = await supabase
        .from('surveys')
        .update({
          title: form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
          target_audience: form.target_audience,
          target_employee_ids: form.target_audience === 'selected' ? form.target_employee_ids : [],
          is_anonymous: form.is_anonymous,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingId);

      if (surveyErr) {
        toast.error(surveyErr.message);
        setSubmitting(false);
        return;
      }
      await supabase.from('survey_questions').delete().eq('survey_id', editingId);
      const questionRows = form.questions.map((q, i) => ({
        survey_id: editingId,
        sort_order: i,
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: q.answer_type === 'multiple_choice' ? q.options : [],
      }));
      const { error: qErr } = await supabase.from('survey_questions').insert(questionRows);
      if (qErr) toast.error(qErr.message);
      else toast.success('Survey updated.');
      setCreateOpen(false);
      setEditingId(null);
      setForm({ title: '', description: '', start_date: today, end_date: today, target_audience: 'all', target_employee_ids: [], is_anonymous: false, questions: [] });
      fetchSurveys();
    } else {
      const { data: surveyRow, error: surveyErr } = await supabase
        .from('surveys')
        .insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          start_date: form.start_date,
          end_date: form.end_date,
          author_id: currentUser.id,
          target_audience: form.target_audience,
          target_employee_ids: form.target_audience === 'selected' ? form.target_employee_ids : [],
          is_anonymous: form.is_anonymous,
        })
        .select('id')
        .single();

      if (surveyErr) {
        toast.error(surveyErr.message);
        setSubmitting(false);
        return;
      }

      const questionRows = form.questions.map((q, i) => ({
        survey_id: surveyRow.id,
        sort_order: i,
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: q.answer_type === 'multiple_choice' ? q.options : [],
      }));
      const { error: qErr } = await supabase.from('survey_questions').insert(questionRows);

      if (qErr) {
        toast.error(qErr.message);
        setSubmitting(false);
        return;
      }
      toast.success('Survey created.');
      setCreateOpen(false);
      setForm({
        title: '',
        description: '',
        start_date: today,
        end_date: today,
        target_audience: 'all',
        target_employee_ids: [],
        is_anonymous: false,
        questions: [],
      });
      fetchSurveys();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('surveys').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Survey deleted.');
      setDeleteId(null);
      fetchSurveys();
    }
  };

  const addQuestion = () => {
    setForm((f) => ({
      ...f,
      questions: [...f.questions, { question_text: '', answer_type: 'text', options: [] }],
    }));
  };

  const updateQuestion = (idx: number, upd: Partial<{ question_text: string; answer_type: SurveyAnswerType; options: string[] }>) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) => (i === idx ? { ...q, ...upd } : q)),
    }));
  };

  const removeQuestion = (idx: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.filter((_, i) => i !== idx),
    }));
  };

  const addOption = (qIdx: number) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx && q.answer_type === 'multiple_choice' ? { ...q, options: [...q.options, ''] } : q
      ),
    }));
  };

  const updateOption = (qIdx: number, optIdx: number, val: string) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q, i) =>
        i === qIdx && q.answer_type === 'multiple_choice'
          ? { ...q, options: q.options.map((o, j) => (j === optIdx ? val : o)) }
          : q
      ),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {isAdmin && (
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            Create Survey
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {surveys.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No active surveys at this time.</p>
            </CardContent>
          </Card>
        ) : (
          surveys.map((s) => {
            const hasResponded = myResponses.has(s.id);
            return (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.title}</CardTitle>
                  {s.description && (
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {s.start_date} – {s.end_date}
                    {s.is_anonymous && ' • Anonymous'}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      {hasResponded ? (
                        <p className="text-sm text-emerald-600">You have already completed this survey.</p>
                      ) : (
                        <Button onClick={() => handleOpenAnswer(s)}>Take Survey</Button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openCreate(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteId(s.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!answerSurvey} onOpenChange={(o) => !o && setAnswerSurvey(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{answerSurvey?.title}</DialogTitle>
            {answerSurvey?.description && (
              <DialogDescription>{answerSurvey.description}</DialogDescription>
            )}
          </DialogHeader>
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
                    {q.options.map((opt, i) => (
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
            <Button variant="outline" onClick={() => setAnswerSurvey(null)}>Cancel</Button>
            <Button onClick={handleSubmitAnswer} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Survey' : 'Create Survey'}</DialogTitle>
            <DialogDescription>Create a Google Form-style survey with multiple question types.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Survey Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Survey name"
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="anon"
                checked={form.is_anonymous}
                onChange={(e) => setForm((f) => ({ ...f, is_anonymous: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="anon">Anonymous responses</Label>
            </div>
            <div>
              <Label>Target Audience</Label>
              <Select
                value={form.target_audience}
                onValueChange={(v) => setForm((f) => ({ ...f, target_audience: v as 'all' | 'selected' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  <SelectItem value="selected">Selected employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.target_audience === 'selected' && (
              <div>
                <Label>Select Employees</Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-2">
                  {employees.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.target_employee_ids.includes(e.id)}
                        onChange={() =>
                          setForm((f) =>
                            f.target_employee_ids.includes(e.id)
                              ? { ...f, target_employee_ids: f.target_employee_ids.filter((id) => id !== e.id) }
                              : { ...f, target_employee_ids: [...f.target_employee_ids, e.id] }
                          )
                        }
                        className="rounded"
                      />
                      <span className="text-sm">{e.first_name} {e.last_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Questions</Label>
                <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                  Add Question
                </Button>
              </div>
              <div className="space-y-4">
                {form.questions.map((q, idx) => (
                  <div key={idx} className="border rounded-md p-4 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={q.question_text}
                        onChange={(e) => updateQuestion(idx, { question_text: e.target.value })}
                        placeholder="Question text"
                      />
                      <Select
                        value={q.answer_type}
                        onValueChange={(v) => updateQuestion(idx, { answer_type: v as SurveyAnswerType })}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ANSWER_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" onClick={() => removeQuestion(idx)}>×</Button>
                    </div>
                    {q.answer_type === 'multiple_choice' && (
                      <div className="pl-4 space-y-2">
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex gap-2">
                            <Input
                              value={opt}
                              onChange={(e) => updateOption(idx, oi, e.target.value)}
                              placeholder={`Option ${oi + 1}`}
                              className="max-w-xs"
                            />
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => addOption(idx)}>
                          Add option
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Update Survey' : 'Create Survey'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete survey?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the survey and all responses. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ActivitySurveyTab;
