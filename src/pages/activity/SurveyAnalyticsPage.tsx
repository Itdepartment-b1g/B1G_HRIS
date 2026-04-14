import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ArrowLeft, Download, ChevronDown, Users } from 'lucide-react';
import { toast } from 'sonner';
import { exportSurveyResults } from '@/lib/exportSurveyResults';
import type { Survey, SurveyQuestion } from '@/types';

interface SurveyWithMeta extends Survey {
  response_count?: number;
}

interface EmployeeAnswer {
  employee_id: string;
  employee_name: string;
  answer: string | number;
}

interface QuestionAnalytics {
  question_id: string;
  question_text: string;
  answer_type: string;
  options?: string[];
  mc_counts?: Record<string, number>;
  rating_avg?: number;
  rating_counts?: Record<number, number>;
  text_responses?: string[];
  employee_answers?: EmployeeAnswer[];
}

const SurveyAnalyticsPage = () => {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<SurveyWithMeta[]>([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState<string | null>(null);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyWithMeta | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [analytics, setAnalytics] = useState<QuestionAnalytics[]>([]);
  const [responseCount, setResponseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const fetchSurveys = useCallback(async () => {
    const { data } = await supabase
      .from('surveys')
      .select('*')
      .order('created_at', { ascending: false });

    const withCounts = await Promise.all(
      (data || []).map(async (s) => {
        const { count } = await supabase
          .from('survey_responses')
          .select('*', { count: 'exact', head: true })
          .eq('survey_id', s.id);
        const { count: compCount } = await supabase
          .from('survey_completions')
          .select('*', { count: 'exact', head: true })
          .eq('survey_id', s.id);
        return { ...s, response_count: (count || 0) + (compCount || 0) };
      })
    );
    setSurveys(withCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  useEffect(() => {
    if (!selectedSurveyId) {
      setQuestions([]);
      setAnalytics([]);
      setResponseCount(0);
      setSelectedSurvey(null);
      return;
    }
    const load = async () => {
      setAnalyticsLoading(true);

      // Fetch survey details including is_anonymous
      const { data: surveyData } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', selectedSurveyId)
        .single();
      if (surveyData) {
        setSelectedSurvey(surveyData as SurveyWithMeta);
      }

      const { data: qData } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', selectedSurveyId)
        .order('sort_order');
      const questionsList = (qData || []) as SurveyQuestion[];
      setQuestions(questionsList);

      const { count } = await supabase
        .from('survey_responses')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', selectedSurveyId);
      const { count: compCount } = await supabase
        .from('survey_completions')
        .select('*', { count: 'exact', head: true })
        .eq('survey_id', selectedSurveyId);
      setResponseCount((count || 0) + (compCount || 0));

      // Fetch responses
      const { data: respData } = await supabase
        .from('survey_responses')
        .select('id, employee_id')
        .eq('survey_id', selectedSurveyId);
      const respIds = (respData || []).map((r) => r.id);

      // Get unique employee IDs (excluding nulls for anonymous)
      const employeeIds = [...new Set((respData || []).map((r) => r.employee_id).filter(Boolean))];

      // Fetch employee data separately
      const { data: empData } = await supabase
        .from('employees')
        .select('id, first_name, last_name')
        .in('id', employeeIds.length ? employeeIds : ['00000000-0000-0000-0000-000000000000']);

      // Build employee lookup map
      const employeeMap = new Map<string, { first_name: string; last_name: string }>();
      for (const e of empData || []) {
        employeeMap.set(e.id, e);
      }

      // Build response_id -> employee map
      const respEmployeeMap = new Map<string, { employee_id: string; employee_name: string }>();
      for (const r of respData || []) {
        const emp = r.employee_id ? employeeMap.get(r.employee_id) : null;
        respEmployeeMap.set(r.id, {
          employee_id: r.employee_id || 'anonymous',
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : (r.employee_id ? 'Unknown' : 'Anonymous'),
        });
      }

      const { data: ansData } = await supabase
        .from('survey_answers')
        .select('*')
        .in('response_id', respIds.length ? respIds : ['00000000-0000-0000-0000-000000000000']);

      const qMap = new Map(questionsList.map((q) => [q.id, q]));
      const byQuestion = new Map<string, QuestionAnalytics>();
      for (const a of ansData || []) {
        const q = qMap.get(a.question_id);
        if (!q) continue;
        let an = byQuestion.get(q.id);
        if (!an) {
          an = {
            question_id: q.id,
            question_text: q.question_text,
            answer_type: q.answer_type,
            options: (q.options as string[]) || [],
            mc_counts: {},
            rating_avg: 0,
            rating_counts: {},
            text_responses: [],
            employee_answers: [],
          };
          byQuestion.set(q.id, an);
        }
        const ans = a as { answer_choice?: string; answer_rating?: number; answer_text?: string; response_id: string };

        // Get employee info for this answer
        const emp = respEmployeeMap.get(ans.response_id);

        if (q.answer_type === 'multiple_choice' && ans.answer_choice) {
          an.mc_counts = an.mc_counts || {};
          an.mc_counts[ans.answer_choice] = (an.mc_counts[ans.answer_choice] || 0) + 1;
          if (emp) {
            an.employee_answers = an.employee_answers || [];
            an.employee_answers.push({
              employee_id: emp.employee_id,
              employee_name: emp.employee_name,
              answer: ans.answer_choice,
            });
          }
        }
        if (q.answer_type === 'rating' && ans.answer_rating != null) {
          const n = ans.answer_rating;
          an.rating_counts = an.rating_counts || {};
          an.rating_counts[n] = (an.rating_counts[n] || 0) + 1;
          if (emp) {
            an.employee_answers = an.employee_answers || [];
            an.employee_answers.push({
              employee_id: emp.employee_id,
              employee_name: emp.employee_name,
              answer: n,
            });
          }
        }
        if (q.answer_type === 'text' && ans.answer_text) {
          an.text_responses = an.text_responses || [];
          an.text_responses.push(ans.answer_text);
          if (emp) {
            an.employee_answers = an.employee_answers || [];
            an.employee_answers.push({
              employee_id: emp.employee_id,
              employee_name: emp.employee_name,
              answer: ans.answer_text,
            });
          }
        }
      }

      const result: QuestionAnalytics[] = [];
      for (const [, v] of byQuestion) {
        if (v.answer_type === 'rating' && v.rating_counts) {
          const entries = Object.entries(v.rating_counts);
          const sum = entries.reduce((s, [k, c]) => s + Number(k) * c, 0);
          const total = entries.reduce((s, [, c]) => s + c, 0);
          v.rating_avg = total > 0 ? sum / total : 0;
        }
        // Sort employee answers by name
        if (v.employee_answers) {
          v.employee_answers.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
        }
        result.push(v);
      }
      setAnalytics(result);
      setAnalyticsLoading(false);
    };
    load();
  }, [selectedSurveyId]);

  const selectedSurveyInfo = surveys.find((s) => s.id === selectedSurveyId);
  const displaySurvey = selectedSurvey || selectedSurveyInfo;

  const toggleQuestionExpand = (questionId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    if (!selectedSurveyId || !displaySurvey) return;
    setExportLoading(true);
    try {
      await exportSurveyResults({
        surveyId: selectedSurveyId,
        format,
        survey: displaySurvey,
        analytics,
        responseCount,
        isAnonymous: selectedSurvey?.is_anonymous,
      });
      toast.success(`Survey results exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export survey results');
    } finally {
      setExportLoading(false);
    }
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/activity/survey')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Survey Analytics</h1>
          <p className="text-muted-foreground text-sm">View analytics for surveys</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Survey</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedSurveyId || ''} onValueChange={(v) => setSelectedSurveyId(v || null)}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Choose a survey" />
              </SelectTrigger>
              <SelectContent>
                {surveys.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} ({s.start_date} – {s.end_date}) — {s.response_count ?? 0} responses
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedSurveyId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exportLoading}>
                    {exportLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                    Download
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export XLSX</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedSurveyId && (
        <>
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{displaySurvey?.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {responseCount} response{responseCount !== 1 ? 's' : ''}
                    {selectedSurvey?.is_anonymous && (
                      <span className="ml-2 text-amber-600 font-medium">(Anonymous Survey)</span>
                    )}
                  </p>
                </CardHeader>
              </Card>

              {analytics.map((a) => (
                <Card key={a.question_id}>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{a.question_text}</CardTitle>
                    <p className="text-xs text-muted-foreground">{a.answer_type}</p>
                  </CardHeader>
                  <CardContent>
                    {a.answer_type === 'multiple_choice' && a.mc_counts && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Choice</TableHead>
                            <TableHead>Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(a.mc_counts).map(([choice, count]) => (
                            <TableRow key={choice}>
                              <TableCell>{choice}</TableCell>
                              <TableCell>{count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {a.answer_type === 'rating' && (
                      <div className="space-y-2">
                        <p className="text-sm">
                          Average: <strong>{a.rating_avg?.toFixed(2) ?? '—'}</strong>
                        </p>
                        {a.rating_counts && (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Rating</TableHead>
                                <TableHead>Count</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <TableRow key={n}>
                                  <TableCell>{n}</TableCell>
                                  <TableCell>{a.rating_counts[n] ?? 0}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                    {a.answer_type === 'text' && a.text_responses && a.text_responses.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {a.text_responses.map((t, i) => (
                          <p key={i} className="text-sm border-b pb-2 last:border-0">
                            {t}
                          </p>
                        ))}
                      </div>
                    )}
                    {a.answer_type === 'text' && (!a.text_responses || a.text_responses.length === 0) && (
                      <p className="text-sm text-muted-foreground">No text responses.</p>
                    )}

                    {/* Individual Employee Answers - Collapsible */}
                    {a.employee_answers && a.employee_answers.length > 0 && !selectedSurvey?.is_anonymous && (
                      <Collapsible
                        open={expandedQuestions.has(a.question_id)}
                        onOpenChange={() => toggleQuestionExpand(a.question_id)}
                        className="mt-4 border-t pt-4"
                      >
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="w-full justify-between">
                            <span className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              View Individual Responses ({a.employee_answers.length})
                            </span>
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                expandedQuestions.has(a.question_id) ? 'rotate-180' : ''
                              }`}
                            />
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 max-h-80 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-1/2">Employee</TableHead>
                                  <TableHead>Answer</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {a.employee_answers.map((ea) => (
                                  <TableRow key={ea.employee_id}>
                                    <TableCell className="font-medium">{ea.employee_name}</TableCell>
                                    <TableCell>{ea.answer}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Anonymous survey warning */}
                    {selectedSurvey?.is_anonymous && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                        <p className="text-sm text-amber-800">
                          Individual responses are hidden for anonymous surveys.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {analytics.length === 0 && !analyticsLoading && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No responses yet.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SurveyAnalyticsPage;
