import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, History, Loader2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AssignmentFields } from '@/components/performance/AssignmentFields';
import { SignaturePad } from '@/components/performance/SignaturePad';
import {
  ACKNOWLEDGEMENT_TEXT,
  DUE_META,
  EVALUATION_SELECT,
  EVENT_LABELS,
  STATUS_META,
  bandLabel,
  computeAverage,
  dueKey,
  formatDate,
  formatDateTime,
  fullName,
  isAdminRole,
  type EvaluationEvent,
  type EvaluationRow,
  type FactorRating,
} from '@/lib/performance';
import { errorMessage, loadPeopleDirectory, type PeopleDirectory } from '@/lib/performanceData';
import { downloadEvaluationSheet } from '@/lib/exportPerformanceEvaluation';

const PerformanceEvaluationPage = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const admin = isAdminRole(user?.roles);

  const [ev, setEv] = useState<EvaluationRow | null>(null);
  const [events, setEvents] = useState<EvaluationEvent[]>([]);
  const [directory, setDirectory] = useState<PeopleDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Evaluator form state
  const [ratings, setRatings] = useState<Record<string, FactorRating>>({});
  const [sectionValues, setSectionValues] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState('');

  // Employee acknowledgement
  const [ackChecked, setAckChecked] = useState(false);
  const [ackComment, setAckComment] = useState('');

  // Signatures (drawn images; stored only when the person signs)
  const [evaluatorSig, setEvaluatorSig] = useState<string | null>(null);
  const [hrSig, setHrSig] = useState<string | null>(null);

  // HR signature
  const [hrComment, setHrComment] = useState('');
  const [skipReason, setSkipReason] = useState('');

  // Admin dialogs
  const [assignOpen, setAssignOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [assignEvaluatorIds, setAssignEvaluatorIds] = useState<string[]>([]);
  const [assignHrIds, setAssignHrIds] = useState<string[]>([]);
  const [reasonAction, setReasonAction] = useState<'cancel' | 'reopen' | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [evRes, evtRes, dir] = await Promise.all([
      supabase.from('performance_evaluations').select(EVALUATION_SELECT).eq('id', id).maybeSingle(),
      supabase
        .from('performance_evaluation_events')
        .select('*, actor:employees!actor_id(first_name, last_name)')
        .eq('evaluation_id', id)
        .order('created_at', { ascending: true }),
      loadPeopleDirectory().catch(() => null),
    ]);

    if (evRes.error) {
      toast.error(errorMessage(evRes.error, 'Failed to load evaluation'));
    }
    if (!evRes.data) {
      setNotFound(true);
    } else {
      const row = evRes.data as unknown as EvaluationRow;
      setEv(row);
      setRatings(row.ratings ?? {});
      setSectionValues(row.section_values ?? {});
      setRecommendation(row.recommendation ?? '');
    }
    if (!evtRes.error) setEvents((evtRes.data ?? []) as unknown as EvaluationEvent[]);
    setDirectory(dir);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const snap = ev?.form_snapshot;
  const isEvaluator = !!ev?.evaluators?.some((v) => v.evaluator_id === user?.id);
  const isEmployee = !!ev && ev.employee_id === user?.id;
  const isHrSigner = !!ev && !!ev.hr_signers?.some((s) => s.hr_signer_id === user?.id);
  const editable = !!ev && isEvaluator && ev.status === 'scheduled';
  const canAck = !!ev && isEmployee && ev.status === 'submitted';
  const canHrSign = !!ev && isHrSigner && (ev.status === 'acknowledged' || ev.status === 'submitted');
  const canAssign = admin && !!ev && ['scheduled', 'submitted', 'acknowledged'].includes(ev.status);
  const canCancel = admin && !!ev && !['hr_signed', 'cancelled'].includes(ev.status);
  const canReopen = admin && !!ev && ['submitted', 'acknowledged', 'hr_signed'].includes(ev.status);
  const showForm = !!ev && (ev.status !== 'scheduled' || editable || admin);

  const preview = useMemo(
    () => (snap && editable ? computeAverage(snap.factors, ratings) : null),
    [snap, editable, ratings]
  );
  const displayAverage = editable ? preview?.average ?? null : ev?.average_score ?? null;
  const displayLabel = editable
    ? bandLabel(preview?.average ?? null, snap?.rating_bands ?? [])
    : ev?.rating_label ?? null;

  const scaleLabel = (value: number | null | undefined) =>
    value == null ? '—' : `${value} – ${snap?.rating_scale.find((s) => s.value === value)?.label ?? ''}`;

  const setRating = (factorId: string, value: number) => {
    setRatings((cur) => ({ ...cur, [factorId]: { rating: value, comment: cur[factorId]?.comment ?? '' } }));
  };
  const setComment = (factorId: string, comment: string) => {
    setRatings((cur) => ({ ...cur, [factorId]: { rating: cur[factorId]?.rating ?? null, comment } }));
  };

  const validateSubmit = (): string | null => {
    if (!snap) return 'Form not loaded';
    for (const f of snap.factors) {
      if (f.required && ratings[f.id]?.rating == null) return `Please rate: ${f.title}`;
    }
    for (const s of snap.sections) {
      if (s.required && !(sectionValues[s.id] ?? '').trim()) return `Please complete: ${s.title}`;
    }
    if (snap.recommendation_options.length > 0 && snap.recommendation_required && !recommendation) {
      return 'Please select a recommendation';
    }
    if (preview?.average == null) return 'Rate at least one factor';
    return null;
  };

  const openSubmit = () => {
    if (preview?.average == null) return;
    const err = validateSubmit();
    if (err) return toast.error(err);
    setEvaluatorSig(null);
    setSignOpen(true);
  };

  const submitEvaluation = async () => {
    if (!ev || !snap) return;
    if (!evaluatorSig) return toast.error('Draw your signature before submitting');

    const payload: Record<string, FactorRating> = {};
    for (const f of snap.factors) {
      const r = ratings[f.id];
      if (r && (r.rating != null || (r.comment ?? '').trim())) {
        payload[f.id] = { rating: r.rating, comment: (r.comment ?? '').trim() };
      }
    }

    setBusy(true);
    const { error } = await supabase.rpc('performance_submit_evaluation', {
      p_evaluation_id: ev.id,
      p_ratings: payload,
      p_section_values: sectionValues,
      p_recommendation: recommendation || null,
      p_signature: evaluatorSig,
    });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Could not submit evaluation'));
    setSignOpen(false);
    setEvaluatorSig(null);
    toast.success('Evaluation submitted. The employee has been notified.');
    load();
  };

  const acknowledge = async () => {
    if (!ev) return;
    if (!ackChecked) return toast.error('Please tick the acknowledgement statement first');
    setBusy(true);
    const { error } = await supabase.rpc('performance_acknowledge', {
      p_evaluation_id: ev.id,
      p_comment: ackComment.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Could not acknowledge'));
    toast.success('Acknowledgement recorded');
    load();
  };

  const hrSign = async (withoutAcknowledgement: boolean) => {
    if (!ev) return;
    if (withoutAcknowledgement && !skipReason.trim()) {
      return toast.error('Enter why the employee has not acknowledged');
    }
    if (!hrSig) return toast.error('Please draw your signature first');
    setBusy(true);
    const { error } = await supabase.rpc('performance_hr_sign', {
      p_evaluation_id: ev.id,
      p_comment: hrComment.trim() || null,
      p_skip_ack_reason: withoutAcknowledgement ? skipReason.trim() : null,
      p_signature: hrSig,
    });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Could not sign'));
    toast.success('Signed by HR');
    setHrSig(null);
    load();
  };

  const openAssign = () => {
    if (!ev) return;
    setAssignEvaluatorIds(ev.evaluators?.map((v) => v.evaluator_id) ?? []);
    setAssignHrIds(ev.hr_signers?.map((s) => s.hr_signer_id) ?? []);
    setAssignOpen(true);
  };

  const saveAssign = async () => {
    if (!ev) return;
    if (assignHrIds.length === 0) return toast.error('Select at least one HR signer');
    setBusy(true);
    const { error } = await supabase.rpc('performance_update_assignments', {
      p_evaluation_id: ev.id,
      p_evaluator_ids: ev.status === 'scheduled' ? assignEvaluatorIds : null,
      p_hr_signer_ids: assignHrIds,
    });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Could not save assignments'));
    toast.success('Assignments saved');
    setAssignOpen(false);
    load();
  };

  const runReasonAction = async () => {
    if (!ev || !reasonAction) return;
    if (!reason.trim()) return toast.error('Enter a reason');
    setBusy(true);
    const fn = reasonAction === 'cancel' ? 'performance_cancel_evaluation' : 'performance_reopen_evaluation';
    const { error } = await supabase.rpc(fn, { p_evaluation_id: ev.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) return toast.error(errorMessage(error, 'Action failed'));
    toast.success(reasonAction === 'cancel' ? 'Evaluation cancelled' : 'Evaluation reopened');
    setReasonAction(null);
    setReason('');
    load();
  };

  if (loading && !ev) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !ev || !snap) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate('/dashboard/performance')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Performance
        </Button>
        <p className="text-muted-foreground">This evaluation was not found or you do not have access to it.</p>
      </div>
    );
  }

  const dk = dueKey(ev);
  const dueMeta = DUE_META[dk];
  const statusMeta = STATUS_META[ev.status];
  const evaluatorNames = ev.evaluators?.length ? ev.evaluators.map((v) => fullName(v.evaluator)).join(', ') : null;

  const ratingText = (value: number | null | undefined) => {
    if (value == null || !snap) return '';
    const label = snap.rating_scale.find((s) => s.value === value)?.label;
    return label ? `${value} – ${label}` : String(value);
  };

  const downloadSheet = async (format: 'pdf' | 'xlsx') => {
    if (!snap) return;
    const sourceRatings = editable ? ratings : ev.ratings ?? {};
    const sourceSections = editable ? sectionValues : ev.section_values ?? {};
    const sourceRecommendation = editable ? recommendation : ev.recommendation ?? '';
    setExporting(true);
    try {
      await downloadEvaluationSheet(format, {
        formName: ev.template_name,
        periodLabel: ev.period_label,
        fullName: snap.employee.full_name,
        position: snap.employee.position ?? '—',
        department: snap.employee.department ?? '—',
        employmentStatus: snap.employee.employment_status ?? '—',
        employeeCode: snap.employee.employee_code,
        dateHired: formatDate(snap.employee.date_hired),
        evaluatorName: evaluatorNames ?? 'Unassigned',
        periodFrom: formatDate(ev.period_from),
        periodTo: formatDate(ev.period_to ?? ev.due_date),
        dateOfEvaluation: formatDate(ev.date_of_evaluation),
        scaleLine: `Rate each factor using the scale below: ${snap.rating_scale.map((s) => `${s.value} – ${s.label}`).join(' | ')}`,
        factors: snap.factors.map((f) => ({
          title: f.title,
          description: f.description,
          rating: ratingText(sourceRatings[f.id]?.rating),
          comment: sourceRatings[f.id]?.comment ?? '',
        })),
        averageScore: displayAverage != null ? displayAverage.toFixed(1) : '',
        overallRating: displayLabel ?? '',
        sections: snap.sections.map((s) => ({ title: s.title, body: sourceSections[s.id] ?? '' })),
        recommendation: sourceRecommendation,
        signatures: [
          {
            title: "Evaluator's signature",
            name: ev.submitted_at ? fullName(ev.submitted ?? null) : '',
            when: ev.submitted_at ? formatDateTime(ev.submitted_at) : '',
            image: ev.evaluator_signature,
            note: '',
          },
          {
            title: "Employee's signature",
            name: ev.acknowledged_at ? snap.employee.full_name : '',
            when: ev.acknowledged_at ? formatDateTime(ev.acknowledged_at) : '',
            image: null,
            note: ev.ack_skipped_reason
              ? `Not acknowledged: ${ev.ack_skipped_reason}`
              : ev.employee_comment ?? '',
          },
          {
            title: 'HR Department signature',
            name: ev.hr_signed_at ? fullName(ev.hr_signed ?? null) : '',
            when: ev.hr_signed_at ? formatDateTime(ev.hr_signed_at) : '',
            image: ev.hr_signature,
            note: ev.hr_comment ?? '',
          },
        ],
        filenameBase: `${snap.employee.employee_code}-${ev.period_label}-evaluation`,
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the file'));
    } finally {
      setExporting(false);
    }
  };
  const hasAnyRole = isEvaluator || isEmployee || isHrSigner || admin;
  const evaluatorOptions = directory ? directory.superiorsOf(ev.employee_id) : [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/dashboard/performance')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Performance
        </Button>
        {showForm && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto" disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadSheet('pdf')}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadSheet('xlsx')}>Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Title + status */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words">
          {ev.period_label} Performance Evaluation
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusMeta.className}>{statusMeta.label}</Badge>
          <Badge variant="outline" className={dueMeta.className}>{dueMeta.label}</Badge>
          <span className="text-sm text-muted-foreground">Due {formatDate(ev.due_date)}</span>
          {ev.reopen_count > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Reopened {ev.reopen_count}×</Badge>
          )}
        </div>
        {ev.status === 'cancelled' && ev.cancel_reason && (
          <p className="text-sm text-red-700">Cancelled: {ev.cancel_reason}</p>
        )}
      </div>

      {/* Waiting states */}
      {ev.status === 'scheduled' && !editable && !admin && isEmployee && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Your evaluation has not been submitted by your evaluator yet. You will be notified when it is ready to review.
          </CardContent>
        </Card>
      )}
      {ev.status === 'scheduled' && !editable && !admin && isHrSigner && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Waiting for the evaluator to submit this evaluation.
          </CardContent>
        </Card>
      )}
      {!hasAnyRole && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">You do not have access to this evaluation.</CardContent>
        </Card>
      )}

      {/* Evaluation sheet header (mirrors HR's form) */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluation details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Field label="Full name" value={snap.employee.full_name} />
              <Field label="Employee code" value={snap.employee.employee_code} />
              <Field label="Position" value={snap.employee.position ?? '—'} />
              <Field label="Department" value={snap.employee.department ?? '—'} />
              <Field label="Employment status" value={snap.employee.employment_status ?? '—'} />
              <Field label="Date hired" value={formatDate(snap.employee.date_hired)} />
              <Field label="Evaluator's name" value={evaluatorNames ?? 'Unassigned'} />
              <Field label="Evaluation period" value={`${formatDate(ev.period_from)} – ${formatDate(ev.period_to ?? ev.due_date)}`} />
              <Field label="Date of evaluation" value={formatDate(ev.date_of_evaluation)} />
              <Field label="Form version" value={`${ev.template_name} · v${ev.template_version}`} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Factors */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance factors</CardTitle>
            <p className="text-xs text-muted-foreground break-words">
              Rate each factor: {snap.rating_scale.map((s) => `${s.value} – ${s.label}`).join(' | ')}
            </p>
          </CardHeader>
          <CardContent>
            <div className="md:hidden space-y-3">
              {snap.factors.map((f) => {
                const current = editable ? ratings[f.id] : ev.ratings?.[f.id];
                return (
                  <div key={f.id} className="rounded-xl border p-4 space-y-3">
                    <div>
                      <p className="font-medium text-sm">
                        {f.title}
                        {!f.required && <span className="text-xs text-muted-foreground"> (optional)</span>}
                      </p>
                      {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Rating</p>
                      {editable ? (
                        <Select
                          value={current?.rating != null ? String(current.rating) : ''}
                          onValueChange={(v) => setRating(f.id, Number(v))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select rating" />
                          </SelectTrigger>
                          <SelectContent>
                            {snap.rating_scale.map((s) => (
                              <SelectItem key={s.value} value={String(s.value)}>
                                {s.value} – {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm">{scaleLabel(current?.rating)}</p>
                      )}
                    </div>
                    {(editable ? f.has_comment : !!current?.comment) && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Comment</p>
                        {editable && f.has_comment ? (
                          <Textarea
                            rows={2}
                            value={current?.comment ?? ''}
                            onChange={(e) => setComment(f.id, e.target.value)}
                            placeholder="Optional comment"
                          />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">{current?.comment}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Factor</TableHead>
                  <TableHead className="w-[25%]">Rating</TableHead>
                  <TableHead>Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snap.factors.map((f) => {
                  const current = editable ? ratings[f.id] : ev.ratings?.[f.id];
                  return (
                    <TableRow key={f.id} className="align-top">
                      <TableCell>
                        <div className="font-medium text-sm">
                          {f.title}
                          {!f.required && <span className="text-xs text-muted-foreground"> (optional)</span>}
                        </div>
                        {f.description && <div className="text-xs text-muted-foreground mt-1">{f.description}</div>}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Select
                            value={current?.rating != null ? String(current.rating) : ''}
                            onValueChange={(v) => setRating(f.id, Number(v))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select rating" />
                            </SelectTrigger>
                            <SelectContent>
                              {snap.rating_scale.map((s) => (
                                <SelectItem key={s.value} value={String(s.value)}>
                                  {s.value} – {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{scaleLabel(current?.rating)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editable && f.has_comment ? (
                          <Textarea
                            rows={2}
                            value={current?.comment ?? ''}
                            onChange={(e) => setComment(f.id, e.target.value)}
                            placeholder="Optional comment"
                          />
                        ) : (
                          <span className="text-sm whitespace-pre-wrap">{current?.comment || '—'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Written sections + recommendation + score */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comments and overall rating</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {snap.sections.map((s) => (
              <div key={s.id} className="space-y-2">
                <Label>{s.title}{s.required && <span className="text-red-500"> *</span>}</Label>
                {editable ? (
                  <Textarea
                    rows={3}
                    value={sectionValues[s.id] ?? ''}
                    onChange={(e) => setSectionValues((cur) => ({ ...cur, [s.id]: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap border rounded-md p-3 min-h-[3rem]">
                    {ev.section_values?.[s.id] || '—'}
                  </p>
                )}
              </div>
            ))}

            {snap.recommendation_options.length > 0 && (
              <div className="space-y-2">
                <Label>Recommendation{snap.recommendation_required && <span className="text-red-500"> *</span>}</Label>
                {editable ? (
                  <Select value={recommendation || '_none'} onValueChange={(v) => setRecommendation(v === '_none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Select recommendation" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— None —</SelectItem>
                      {snap.recommendation_options.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{ev.recommendation || '—'}</p>
                )}
              </div>
            )}

            <div className="rounded-md border p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-6">
              <div>
                <div className="text-xs text-muted-foreground">Average score</div>
                <div className="text-2xl font-bold">{displayAverage != null ? displayAverage.toFixed(1) : '—'}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Overall rating</div>
                <div className="text-lg font-semibold break-words">{displayLabel ?? '—'}</div>
              </div>
              {editable && (
                <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-xs">
                  Average = sum of rated factors ÷ number of factors rated. Optional factors left blank are not counted.
                </p>
              )}
            </div>

            {editable && (
              <div className="flex print:hidden">
                <Button
                  onClick={openSubmit}
                  disabled={busy || preview?.average == null}
                  title={preview?.average == null ? 'Rate at least one factor to submit' : undefined}
                  className="w-full sm:w-auto sm:ml-auto bg-primary hover:bg-primary/90 text-white"
                >
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit Evaluation
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Signatures */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Signatures</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SignatureBox
              title="1. Evaluator"
              name={ev.submitted_at ? fullName(ev.submitted ?? null) : null}
              signedAt={ev.submitted_at}
              image={ev.evaluator_signature}
              pendingText="Not yet submitted"
            />
            <SignatureBox
              title="2. Employee acknowledgement"
              name={ev.acknowledged_at ? snap.employee.full_name : null}
              signedAt={ev.acknowledged_at}
              pendingText={ev.ack_skipped_reason ? 'Not acknowledged (HR signed without acknowledgement)' : 'Pending'}
              note={ev.employee_comment ? `Comment: ${ev.employee_comment}` : undefined}
            />
            <SignatureBox
              title="3. HR"
              name={ev.hr_signed_at ? fullName(ev.hr_signed ?? null) : null}
              signedAt={ev.hr_signed_at}
              image={ev.hr_signature}
              note={ev.hr_comment ? `Comment: ${ev.hr_comment}` : undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* Employee acknowledgement */}
      {canAck && (
        <Card className="border-violet-200">
          <CardHeader>
            <CardTitle className="text-base flex items-start sm:items-center gap-2"><ShieldCheck className="h-5 w-5 shrink-0 text-violet-600" /> Acknowledge your evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2">
              <Checkbox id="ack" checked={ackChecked} onCheckedChange={(v) => setAckChecked(v === true)} className="mt-0.5" />
              <Label htmlFor="ack" className="cursor-pointer leading-snug">{ACKNOWLEDGEMENT_TEXT}</Label>
            </div>
            <div className="space-y-2">
              <Label>Your comments (optional)</Label>
              <Textarea rows={3} value={ackComment} onChange={(e) => setAckComment(e.target.value)} />
              <p className="text-xs text-muted-foreground">Acknowledging confirms you received and reviewed this evaluation. It does not mean you agree with it.</p>
            </div>
            <div className="flex">
              <Button onClick={acknowledge} disabled={busy || !ackChecked} className="w-full sm:w-auto sm:ml-auto bg-primary hover:bg-primary/90 text-white">
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Acknowledge
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* HR signature */}
      {canHrSign && (
        <Card className="border-emerald-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /> HR signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ev.status === 'submitted' && (
              <p className="text-sm text-amber-700">The employee has not acknowledged this evaluation yet. Sign normally after they acknowledge, or record a reason below to sign without it.</p>
            )}
            <div className="space-y-2">
              <Label>HR comment (optional)</Label>
              <Textarea rows={2} value={hrComment} onChange={(e) => setHrComment(e.target.value)} />
            </div>
            <div className="rounded-md border p-4">
              <SignaturePad label="HR signature" onChange={setHrSig} disabled={busy} />
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2">
              {ev.status === 'submitted' && (
                <div className="w-full space-y-2">
                  <Label>Reason for signing without employee acknowledgement</Label>
                  <Textarea rows={2} value={skipReason} onChange={(e) => setSkipReason(e.target.value)} />
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => hrSign(true)} disabled={busy}>Sign without acknowledgement</Button>
                </div>
              )}
              {ev.status === 'acknowledged' && (
                <Button onClick={() => hrSign(false)} disabled={busy} className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white">
                  {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Sign as HR
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin controls */}
      {admin && (canAssign || canCancel || canReopen) && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Admin actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {canAssign && (
              <Button variant="outline" className="w-full sm:w-auto" onClick={openAssign}>Change evaluators / HR signers</Button>
            )}
            {canReopen && (
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setReason(''); setReasonAction('reopen'); }}>
                <RotateCcw className="h-4 w-4 mr-2" /> Reopen for correction
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" className="w-full sm:w-auto text-red-600" onClick={() => { setReason(''); setReasonAction('cancel'); }}>
                <XCircle className="h-4 w-4 mr-2" /> Cancel evaluation
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit trail */}
      {(admin || isEvaluator || isHrSigner) && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><History className="h-5 w-5" /> Audit trail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="md:hidden space-y-3">
              {events.map((e) => (
                <div key={e.id} className="rounded-xl border p-4 space-y-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{EVENT_LABELS[e.action] ?? e.action}</p>
                    <p className="text-xs text-muted-foreground text-right">{formatDateTime(e.created_at)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{fullName(e.actor) === '—' ? 'System' : fullName(e.actor)}</p>
                  {describeEvent(e) && <p className="text-sm break-words">{describeEvent(e)}</p>}
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(e.created_at)}</TableCell>
                    <TableCell className="text-sm">{EVENT_LABELS[e.action] ?? e.action}</TableCell>
                    <TableCell className="text-sm">{fullName(e.actor) === '—' ? 'System' : fullName(e.actor)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{describeEvent(e)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={signOpen} onOpenChange={(open) => { if (!busy) setSignOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign and submit</DialogTitle>
            <DialogDescription>
              Draw your signature to submit this evaluation. The employee will be asked to acknowledge it.
            </DialogDescription>
          </DialogHeader>
          {signOpen && <SignaturePad label="Evaluator signature" onChange={setEvaluatorSig} disabled={busy} />}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSignOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitEvaluation} disabled={busy || !evaluatorSig} className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Evaluators and HR signers</DialogTitle>
            <DialogDescription>
              {ev.status === 'scheduled'
                ? 'Choose one or more immediate superiors as evaluators, and one or more HR signers.'
                : 'Evaluators are locked after submission. You can still change the HR signers until HR signs.'}
            </DialogDescription>
          </DialogHeader>
          <AssignmentFields
            evaluatorOptions={evaluatorOptions}
            evaluatorIds={assignEvaluatorIds}
            onEvaluatorIdsChange={setAssignEvaluatorIds}
            evaluatorsLocked={ev.status !== 'scheduled'}
            hrOptions={directory?.hrOptions ?? []}
            hrSignerIds={assignHrIds}
            onHrSignerIdsChange={setAssignHrIds}
            hrConfigured={!!directory?.hrDepartmentId}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveAssign} disabled={busy} className="bg-primary hover:bg-primary/90 text-white">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reason dialog (cancel / reopen) */}
      <Dialog open={!!reasonAction} onOpenChange={(o) => { if (!o) setReasonAction(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasonAction === 'cancel' ? 'Cancel evaluation' : 'Reopen evaluation'}</DialogTitle>
            <DialogDescription>
              {reasonAction === 'cancel'
                ? 'Cancelled evaluations are kept for the record and are not created again.'
                : 'The previous scores and signatures are kept in the audit trail. The evaluator must submit again.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonAction(null)} disabled={busy}>Back</Button>
            <Button onClick={runReasonAction} disabled={busy} className={reasonAction === 'cancel' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primary/90 text-white'}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {reasonAction === 'cancel' ? 'Cancel evaluation' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="sm:w-40 shrink-0 text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

/** Name and signature appear only after that person has acted (signedAt is set). */
function SignatureBox({
  title,
  name,
  signedAt,
  image,
  pendingText = 'Pending',
  note,
}: {
  title: string;
  name: string | null;
  signedAt: string | null | undefined;
  image?: string | null;
  pendingText?: string;
  note?: string;
}) {
  const signed = !!signedAt;
  return (
    <div className="rounded-md border p-4 space-y-2 text-sm">
      <div className="font-semibold">{title}</div>
      <div className="h-16 flex items-center justify-center rounded border border-dashed bg-muted/20">
        {signed && image ? (
          <img src={image} alt={`${title} signature`} className="max-h-14 max-w-full object-contain" />
        ) : null}
      </div>
      <div>{signed ? name || '—' : '\u00a0'}</div>
      <div className="text-xs text-muted-foreground">{signed ? formatDateTime(signedAt) : pendingText}</div>
      {note && <div className="text-xs whitespace-pre-wrap">{note}</div>}
    </div>
  );
}

function describeEvent(e: EvaluationEvent): string {
  const d = e.details ?? {};
  switch (e.action) {
    case 'submitted':
      return `Score ${d.average_score ?? '—'} (${d.rating_label ?? '—'})${d.recommendation ? ` · ${d.recommendation}` : ''}`;
    case 'hr_signed':
      return d.signed_without_acknowledgement ? `Signed without acknowledgement: ${d.reason ?? ''}` : 'Signed';
    case 'cancelled':
      return `Reason: ${d.reason ?? ''}`;
    case 'reopened':
      return `Reason: ${d.reason ?? ''} · Previous score ${d.previous_average_score ?? '—'} (${d.previous_rating_label ?? '—'})`;
    case 'created':
      return `Due ${d.due_date ?? ''} · ${d.template ?? ''} v${d.template_version ?? ''}`;
    default:
      return '';
  }
}

export default PerformanceEvaluationPage;
