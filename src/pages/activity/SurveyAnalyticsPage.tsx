import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
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
import { Loader2, ArrowLeft, Download, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { exportSurveyResults } from '@/lib/exportSurveyResults';
import { choiceLabelsFromAnswer, isChoiceAnswerType } from '@/lib/surveyAnswers';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { SurveyQuestionChart } from '@/components/SurveyQuestionChart';
import type { Survey, SurveyQuestion } from '@/types';

const GO_UP_BG = '#472160';

/** Client-side slice + reusable TablePagination for nested answer lists. */
function PaginatedSection<T>({
  items,
  children,
}: {
  items: T[];
  children: (pageItems: T[]) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [pageSize, items.length]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const scrollSectionIntoView = () => {
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="space-y-2">
      {children(pageItems)}
      <TablePagination
        totalItems={items.length}
        currentPage={page}
        onPageChange={(p) => {
          setPage(p);
          scrollSectionIntoView();
        }}
        pageSize={pageSize}
        onPageSizeChange={(s) => {
          setPageSize(s);
          scrollSectionIntoView();
        }}
        className="pr-0 lg:pr-0"
      />
    </div>
  );
}

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
  const [questionPage, setQuestionPage] = useState(1);
  const [questionPageSize, setQuestionPageSize] = useState(PAGE_SIZE);
  const [showGoUp, setShowGoUp] = useState(false);
  const pageTopRef = useRef<HTMLDivElement>(null);

  const scrollToTop = useCallback(() => {
    pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onScroll = () => setShowGoUp(window.scrollY > 200);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!selectedSurveyId) return;
    scrollToTop();
  }, [questionPage, questionPageSize, selectedSurveyId, scrollToTop]);

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
    setQuestionPage(1);
    setExpandedQuestions(new Set());
  }, [selectedSurveyId, questionPageSize]);

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

        if (isChoiceAnswerType(q.answer_type) && ans.answer_choice) {
          const choices = choiceLabelsFromAnswer(q.answer_type, ans.answer_choice);
          an.mc_counts = an.mc_counts || {};
          for (const choice of choices) {
            an.mc_counts[choice] = (an.mc_counts[choice] || 0) + 1;
          }
          if (emp) {
            an.employee_answers = an.employee_answers || [];
            an.employee_answers.push({
              employee_id: emp.employee_id,
              employee_name: emp.employee_name,
              answer: choices.join(', '),
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

  const pagedAnalytics = useMemo(() => {
    const start = (questionPage - 1) * questionPageSize;
    return analytics.slice(start, start + questionPageSize);
  }, [analytics, questionPage, questionPageSize]);

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
    <div ref={pageTopRef} className="space-y-6">
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

              {pagedAnalytics.map((a) => (
                <Card key={a.question_id}>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">{a.question_text}</CardTitle>
                    <p className="text-xs text-muted-foreground">{a.answer_type}</p>
                  </CardHeader>
                  <CardContent>
                    {isChoiceAnswerType(a.answer_type) && a.mc_counts && (
                      <SurveyQuestionChart
                        answerType={a.answer_type}
                        mcCounts={a.mc_counts}
                        options={a.options}
                      />
                    )}
                    {a.answer_type === 'rating' && (
                      <SurveyQuestionChart
                        answerType={a.answer_type}
                        ratingCounts={a.rating_counts}
                        ratingAvg={a.rating_avg}
                      />
                    )}
                    {a.answer_type === 'text' && a.text_responses && a.text_responses.length > 0 && (
                      <PaginatedSection items={a.text_responses}>
                        {(pageItems) => (
                          <div className="space-y-2">
                            {pageItems.map((t, i) => (
                              <p key={`${a.question_id}-text-${i}`} className="text-sm border-b pb-2 last:border-0">
                                {t}
                              </p>
                            ))}
                          </div>
                        )}
                      </PaginatedSection>
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
                          <div className="mt-2">
                            <PaginatedSection items={a.employee_answers}>
                              {(pageItems) => (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-1/2">Employee</TableHead>
                                      <TableHead>Answer</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {pageItems.map((ea, i) => (
                                      <TableRow key={`${ea.employee_id}-${i}`}>
                                        <TableCell className="font-medium">{ea.employee_name}</TableCell>
                                        <TableCell>{ea.answer}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </PaginatedSection>
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

              {analytics.length > 0 && (
                <TablePagination
                  totalItems={analytics.length}
                  currentPage={questionPage}
                  onPageChange={setQuestionPage}
                  pageSize={questionPageSize}
                  onPageSizeChange={setQuestionPageSize}
                />
              )}

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

      <button
        type="button"
        aria-label="Go to top"
        onClick={scrollToTop}
        className={cn(
          'fixed z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'bottom-24 right-4 lg:bottom-8 lg:right-8',
          showGoUp ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{ backgroundColor: GO_UP_BG }}
      >
        <ChevronUp className="h-6 w-6" strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default SurveyAnalyticsPage;
