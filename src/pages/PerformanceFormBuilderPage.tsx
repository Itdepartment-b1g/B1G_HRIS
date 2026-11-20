import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DEFAULT_FACTORS,
  DEFAULT_RATING_BANDS,
  DEFAULT_RATING_SCALE,
  DEFAULT_SECTIONS,
  SCHEDULE_LABEL,
  scheduleSummary,
  type FactorDef,
  type FormTemplate,
  type RatingBand,
  type RatingScaleItem,
  type ScheduleConfig,
  type ScheduleType,
  type SectionDef,
} from '@/lib/performance';
import { errorMessage, loadEmploymentStatuses, type EmploymentStatusOption } from '@/lib/performanceData';

const STEPS = [
  { label: 'Basics', hint: 'Name the form and choose who it is for.' },
  { label: 'Schedule', hint: 'Choose how due dates are created.' },
  { label: 'Factors', hint: 'The items the evaluator rates.' },
  { label: 'Scoring', hint: 'Rating labels, written sections, and the overall result.' },
  { label: 'Review', hint: 'Check the form, then save it.' },
] as const;

const LAST_STEP = STEPS.length - 1;

interface Draft {
  name: string;
  description: string;
  statusIds: string[];
  scheduleType: ScheduleType;
  monthsText: string;
  dayOfMonth: string;
  scale: RatingScaleItem[];
  factors: FactorDef[];
  sections: SectionDef[];
  bands: RatingBand[];
  recOptionsText: string;
  recRequired: boolean;
  isActive: boolean;
  autoCreate: boolean;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function blankDraft(statuses: EmploymentStatusOption[]): Draft {
  const probation = statuses.find((s) => s.name.toLowerCase().includes('probation'));
  return {
    name: 'Probationary Evaluation',
    description: '3rd and 5th month evaluation for probationary employees.',
    statusIds: probation ? [probation.id] : [],
    scheduleType: 'hired_offset',
    monthsText: '3, 5',
    dayOfMonth: '25',
    scale: DEFAULT_RATING_SCALE.map((s) => ({ ...s })),
    factors: DEFAULT_FACTORS.map((f) => ({ ...f })),
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    bands: DEFAULT_RATING_BANDS.map((b) => ({ ...b })),
    recOptionsText: '',
    recRequired: false,
    isActive: false,
    autoCreate: false,
  };
}

function draftFromTemplate(template: FormTemplate): Draft {
  return {
    name: template.name,
    description: template.description ?? '',
    statusIds: template.applies_to_status_ids ?? [],
    scheduleType: template.schedule_type,
    monthsText: (template.schedule_config?.months_after_hire ?? []).join(', '),
    dayOfMonth: String(template.schedule_config?.day_of_month ?? 25),
    scale: template.rating_scale?.length ? template.rating_scale.map((s) => ({ ...s })) : DEFAULT_RATING_SCALE.map((s) => ({ ...s })),
    factors: (template.factors ?? []).map((f) => ({ ...f })),
    sections: (template.sections ?? []).map((s) => ({ ...s })),
    bands: (template.rating_bands ?? []).map((b) => ({ ...b })),
    recOptionsText: (template.recommendation_options ?? []).join('\n'),
    recRequired: template.recommendation_required,
    isActive: template.is_active,
    autoCreate: !!template.auto_create,
  };
}

function parseMonths(monthsText: string): number[] | null {
  const parts = monthsText.split(',').map((p) => p.trim()).filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 120)) return null;
  return [...new Set(nums)].sort((a, b) => a - b);
}

function scheduleConfigOf(draft: Draft): { config: ScheduleConfig; error: string | null } {
  if (draft.scheduleType === 'hired_offset') {
    const months = parseMonths(draft.monthsText);
    if (!months || months.length === 0) return { config: {}, error: 'Months after hire must be whole numbers, e.g. 3, 5' };
    return { config: { months_after_hire: months }, error: null };
  }
  if (draft.scheduleType === 'monthly') {
    const day = Number(draft.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) return { config: {}, error: 'Day of month must be between 1 and 31' };
    return { config: { day_of_month: day }, error: null };
  }
  return { config: {}, error: null };
}

function validateStep(step: number, draft: Draft): string | null {
  if (step === 0) {
    if (!draft.name.trim()) return 'Enter a form name';
    if (draft.statusIds.length === 0) return 'Select at least one employment status this form is for';
  }
  if (step === 1) return scheduleConfigOf(draft).error;
  if (step === 2) {
    if (draft.factors.length === 0) return 'Add at least one factor';
    if (draft.factors.some((f) => !f.title.trim())) return 'Every factor needs a title';
  }
  if (step === 3) {
    if (draft.scale.some((s) => !s.label.trim())) return 'Every rating needs a label';
    if (draft.sections.some((s) => !s.title.trim())) return 'Every section needs a title';
    if (draft.bands.some((b) => Number.isNaN(Number(b.min)) || !b.label.trim())) {
      return 'Every overall rating needs a lowest average and a name';
    }
  }
  return null;
}

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

const PerformanceFormBuilderPage = () => {
  const { templateId = 'new' } = useParams();
  const isNew = templateId === 'new';
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  const [statuses, setStatuses] = useState<EmploymentStatusOption[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMissing(false);
      setLoadFailed(false);
      try {
        const loadedStatuses = await loadEmploymentStatuses();
        if (cancelled) return;
        setStatuses(loadedStatuses);
        if (isNew) {
          setDraft(blankDraft(loadedStatuses));
          setVersion(null);
        } else {
          const { data, error } = await supabase
            .from('performance_form_templates')
            .select('*')
            .eq('id', templateId)
            .maybeSingle();
          if (cancelled) return;
          if (error) throw error;
          if (!data) {
            setMissing(true);
          } else {
            const template = data as unknown as FormTemplate;
            setDraft(draftFromTemplate(template));
            setVersion(template.version);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(errorMessage(err, 'Could not open this form'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isNew, templateId]);

  const statusName = (id: string) => statuses.find((s) => s.id === id)?.name ?? 'Unknown';

  const previewSchedule = useMemo(() => {
    if (!draft) return '';
    const parsed = scheduleConfigOf(draft);
    if (parsed.error) {
      if (draft.scheduleType === 'hired_offset') return `Hire date + ${draft.monthsText || '…'}`;
      if (draft.scheduleType === 'monthly') return `Every month, day ${draft.dayOfMonth || '…'}`;
    }
    return scheduleSummary({ schedule_type: draft.scheduleType, schedule_config: parsed.config });
  }, [draft]);

  const goToStep = (target: number) => {
    if (!draft || target === step) return;
    if (target < step) {
      setStep(target);
      return;
    }
    for (let i = step; i < target; i += 1) {
      const err = validateStep(i, draft);
      if (err) {
        toast.error(err);
        setStep(i);
        return;
      }
    }
    setStep(target);
  };

  const save = async (asDraft: boolean) => {
    if (!draft) return;
    for (let i = 0; i <= 3; i += 1) {
      const err = validateStep(i, draft);
      if (err) {
        toast.error(err);
        setStep(i);
        return;
      }
    }
    const { config } = scheduleConfigOf(draft);
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      applies_to_status_ids: draft.statusIds,
      schedule_type: draft.scheduleType,
      schedule_config: config,
      rating_scale: draft.scale.map((s) => ({ ...s, label: s.label.trim() })),
      factors: draft.factors.map((f) => ({ ...f, title: f.title.trim(), description: f.description.trim() })),
      sections: draft.sections.map((s) => ({ ...s, title: s.title.trim() })),
      rating_bands: [...draft.bands].sort((a, b) => Number(b.min) - Number(a.min)),
      recommendation_options: draft.recOptionsText.split('\n').map((x) => x.trim()).filter(Boolean),
      recommendation_required: draft.recRequired,
      is_active: asDraft ? false : draft.isActive,
      auto_create: !asDraft && draft.isActive && draft.scheduleType !== 'manual' && draft.autoCreate,
    };

    setSaving(true);
    const { error } = isNew
      ? await supabase.from('performance_form_templates').insert({ ...payload, created_by: user?.id ?? null })
      : await supabase.from('performance_form_templates').update(payload).eq('id', templateId);
    setSaving(false);

    if (error) return toast.error(errorMessage(error, 'Could not save form'));
    if (asDraft) toast.success('Saved as a draft. It stays inactive until you turn Active on and save.');
    else toast.success(isNew ? 'Form created' : 'Form saved. New evaluations will use this version.');
    navigate('/dashboard/performance?tab=templates');
  };

  if (loading || !draft) {
    if (!loading && (missing || loadFailed)) {
      return (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => navigate('/dashboard/performance?tab=templates')}>
            Back to forms
          </Button>
          <p className="text-muted-foreground">
            {missing ? 'This form was not found.' : 'This form could not be opened.'}
          </p>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const patch = (partial: Partial<Draft>) => setDraft((cur) => (cur ? { ...cur, ...partial } : cur));
  const actions = (
    <BuilderActions
      step={step}
      saving={saving}
      onBack={() => setStep((s) => Math.max(0, s - 1))}
      onDraft={() => save(true)}
      onNext={() => (step === LAST_STEP ? save(false) : goToStep(step + 1))}
    />
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="text-sm text-muted-foreground">
        <Link to="/dashboard/performance?tab=templates" className="hover:text-foreground">Performance</Link>
        <span className="mx-1.5">/</span>
        <Link to="/dashboard/performance?tab=templates" className="hover:text-foreground">Forms</Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{isNew ? 'New form' : 'Edit form'}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {isNew ? 'Create an evaluation form' : `Edit ${draft.name || 'form'}`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {STEPS[step].hint}
          {version != null && <span> Current version v{version}.</span>}
        </p>
      </div>

      <StepBar step={step} onSelect={goToStep} />

      <div className="space-y-4">
        {step === 0 && (
          <BasicsStep draft={draft} statuses={statuses} onChange={patch} />
        )}
        {step === 1 && <ScheduleStep draft={draft} onChange={patch} />}
        {step === 2 && (
          <FactorsStep
            factors={draft.factors}
            onChange={(factors) => patch({ factors })}
          />
        )}
        {step === 3 && <ScoringStep draft={draft} onChange={patch} />}
        {step === 4 && (
          <ReviewStep
            draft={draft}
            statusName={statusName}
            scheduleText={previewSchedule}
            isNew={isNew}
          />
        )}
        <div className="flex items-center justify-between gap-3 border-t pt-4">{actions}</div>
      </div>
    </div>
  );
};

function BuilderActions({
  step,
  saving,
  onBack,
  onDraft,
  onNext,
}: {
  step: number;
  saving: boolean;
  onBack: () => void;
  onDraft: () => void;
  onNext: () => void;
}) {
  const last = step === LAST_STEP;
  return (
    <>
      {step > 0 ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>Back</Button>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDraft} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save as draft
        </Button>
        <Button type="button" onClick={onNext} disabled={saving}>
          {saving && last && <Loader2 className="h-4 w-4 animate-spin" />}
          {last ? 'Save form' : 'Next'}
          {!last && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </>
  );
}

function StepBar({ step, onSelect }: { step: number; onSelect: (index: number) => void }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((item, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li key={item.label} className="flex-1 min-w-0 flex flex-col items-center relative">
            {index > 0 && (
              <span
                className={`absolute top-4 right-1/2 left-0 h-0.5 ${index <= step ? 'bg-primary' : 'bg-border'}`}
                aria-hidden
              />
            )}
            {index < STEPS.length - 1 && (
              <span
                className={`absolute top-4 left-1/2 right-0 h-0.5 ${index < step ? 'bg-primary' : 'bg-border'}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-current={current ? 'step' : undefined}
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                current || done
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background border border-border text-muted-foreground hover:border-primary/40'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </button>
            <span className={`mt-2 text-center text-xs leading-tight px-1 ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BasicsStep({
  draft,
  statuses,
  onChange,
}: {
  draft: Draft;
  statuses: EmploymentStatusOption[];
  onChange: (partial: Partial<Draft>) => void;
}) {
  const toggleStatus = (id: string) => {
    const statusIds = draft.statusIds.includes(id)
      ? draft.statusIds.filter((x) => x !== id)
      : [...draft.statusIds, id];
    onChange({ statusIds });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Basics</h2>
        <p className="text-sm text-muted-foreground">Employees only receive this form while their employment status is selected.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Form details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Form name</Label>
              <Input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Probationary Evaluation" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={draft.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Optional" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Publishing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(v) => onChange({ isActive: v === true, autoCreate: v === true ? draft.autoCreate : false })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Active (available to use)</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  Check this to use the form at all. You can then create evaluations for people by hand with Create Evaluation. Inactive forms cannot be used.
                </span>
              </span>
            </label>
            {draft.scheduleType !== 'manual' && (
              <label className={`flex items-start gap-2 ${draft.isActive ? 'cursor-pointer' : 'opacity-60'}`}>
                <Checkbox
                  checked={draft.autoCreate}
                  disabled={!draft.isActive}
                  onCheckedChange={(v) => onChange({ autoCreate: v === true })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">Create evaluations automatically on schedule</span>
                  <span className="block text-xs text-muted-foreground mt-1">
                    Check this if the system should create these evaluations by itself on their due dates, for example the 3rd and 5th month after the hire date. Uncheck it if you will create each one yourself with Create Evaluation. Probation forms then send HR, admin, and super admin one reminder before each due date. Needs Active checked first.
                  </span>
                </span>
              </label>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Applies to employment status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {statuses.filter((s) => s.is_active).map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40">
                <Checkbox checked={draft.statusIds.includes(s.id)} onCheckedChange={() => toggleStatus(s.id)} />
                <span className="text-sm">{s.name}</span>
              </label>
            ))}
          </div>
          {statuses.filter((s) => s.is_active).length === 0 && (
            <p className="text-sm text-muted-foreground">No active employment statuses yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScheduleStep({ draft, onChange }: { draft: Draft; onChange: (partial: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">Probation uses months after the hire date. Monthly is ready for a later KPI form.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How due dates are created</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={draft.scheduleType} onValueChange={(v) => onChange({ scheduleType: v as ScheduleType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hired_offset">Months after hire date (probation)</SelectItem>
              <SelectItem value="monthly">Monthly on a day (KPI later)</SelectItem>
              <SelectItem value="manual">Manual (HR sets each due date)</SelectItem>
            </SelectContent>
          </Select>
          {draft.scheduleType === 'hired_offset' && (
            <div className="space-y-2">
              <Label>Months after hire</Label>
              <Input value={draft.monthsText} onChange={(e) => onChange({ monthsText: e.target.value })} placeholder="e.g. 3, 5" />
              <p className="text-xs text-muted-foreground">
                Hire date plus each number. Hired Nov 19, 2026 with 3 and 5 is due Feb 19, 2027 and Apr 19, 2027.
              </p>
            </div>
          )}
          {draft.scheduleType === 'monthly' && (
            <div className="space-y-2">
              <Label>Day of month</Label>
              <Input type="number" min={1} max={31} value={draft.dayOfMonth} onChange={(e) => onChange({ dayOfMonth: e.target.value })} />
            </div>
          )}
          {draft.scheduleType === 'manual' && (
            <p className="text-sm text-muted-foreground">Nothing is created automatically. HR sets the due date when creating each evaluation.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const blankFactor = (): FactorDef => ({
  id: newId(),
  title: '',
  description: '',
  required: true,
  include_in_average: true,
  has_comment: true,
});

function FactorsStep({ factors, onChange }: { factors: FactorDef[]; onChange: (factors: FactorDef[]) => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [draftFactor, setDraftFactor] = useState<FactorDef>(blankFactor);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const update = (id: string, partial: Partial<FactorDef>) => {
    onChange(factors.map((f) => (f.id === id ? { ...f, ...partial } : f)));
  };

  const openAdd = () => {
    setDraftFactor(blankFactor());
    setAddOpen(true);
  };

  const addFactor = () => {
    if (!draftFactor.title.trim()) {
      toast.error('Enter a factor name');
      return;
    }
    const next = { ...draftFactor, title: draftFactor.title.trim(), description: draftFactor.description.trim() };
    onChange([...factors, next]);
    setJustAddedId(next.id);
    setAddOpen(false);
    toast.success(`Added “${next.title}”. It is at the bottom of the list.`);
    window.setTimeout(() => {
      document.getElementById(`factor-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Factors</h2>
          <p className="text-sm text-muted-foreground">Each factor is one thing the evaluator scores, such as Quality of Work.</p>
        </div>
        <Button type="button" variant="outline" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add factor
        </Button>
      </div>
      {factors.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No factors yet. Add the first one.</CardContent>
        </Card>
      )}
      {factors.map((factor, index) => (
        <Card key={factor.id} id={`factor-${factor.id}`} className={justAddedId === factor.id ? 'ring-2 ring-primary' : undefined}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-end gap-2">
              <span className="pb-2 w-6 text-center text-sm font-semibold text-muted-foreground">{index + 1}</span>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`factor-name-${factor.id}`}>Factor name</Label>
                <Input
                  id={`factor-name-${factor.id}`}
                  value={factor.title}
                  onChange={(e) => update(factor.id, { title: e.target.value })}
                  placeholder="e.g. Quality of Work"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(moveItem(factors, index, -1))} aria-label="Move up">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(moveItem(factors, index, 1))} aria-label="Move down">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => onChange(factors.filter((f) => f.id !== factor.id))} aria-label="Remove factor">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 pl-8">
              <Label htmlFor={`factor-desc-${factor.id}`}>Description</Label>
              <Input
                id={`factor-desc-${factor.id}`}
                value={factor.description}
                onChange={(e) => update(factor.id, { description: e.target.value })}
                placeholder="What the evaluator should look for. Optional."
              />
            </div>
            <FactorOptions
              factor={factor}
              onChange={(partial) => update(factor.id, partial)}
              className="pl-8"
            />
          </CardContent>
        </Card>
      ))}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add factor</DialogTitle>
            <DialogDescription>
              This is one item the evaluator scores. It is added at the bottom of the list, and you can move it afterward.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-factor-name">Factor name</Label>
              <Input
                id="new-factor-name"
                value={draftFactor.title}
                onChange={(e) => setDraftFactor((cur) => ({ ...cur, title: e.target.value }))}
                placeholder="e.g. Quality of Work"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-factor-desc">Description</Label>
              <Input
                id="new-factor-desc"
                value={draftFactor.description}
                onChange={(e) => setDraftFactor((cur) => ({ ...cur, description: e.target.value }))}
                placeholder="What the evaluator should look for. Optional."
              />
            </div>
            <FactorOptions factor={draftFactor} onChange={(partial) => setDraftFactor((cur) => ({ ...cur, ...partial }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="button" onClick={addFactor}>Add factor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FactorOptions({
  factor,
  onChange,
  className,
}: {
  factor: FactorDef;
  onChange: (partial: Partial<FactorDef>) => void;
  className?: string;
}) {
  const options: { key: 'required' | 'include_in_average' | 'has_comment'; title: string; description: string }[] = [
    {
      key: 'required',
      title: 'Required',
      description: 'The evaluator must give this a score before they can submit.',
    },
    {
      key: 'include_in_average',
      title: 'Counts toward average',
      description: 'This score is included in the overall average. Turn it off to record a score that does not change the result.',
    },
    {
      key: 'has_comment',
      title: 'Comment box',
      description: 'The evaluator can write a note next to the score.',
    },
  ];

  return (
    <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${className ?? ''}`}>
      {options.map((option) => (
        <label key={option.key} className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
          <Checkbox checked={factor[option.key]} onCheckedChange={(v) => onChange({ [option.key]: v === true })} className="mt-0.5" />
          <span>
            <span className="block text-sm font-medium">{option.title}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">{option.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ScoringStep({ draft, onChange }: { draft: Draft; onChange: (partial: Partial<Draft>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Scoring</h2>
        <p className="text-sm text-muted-foreground">Set the score names, the written comments, and how the average becomes an overall rating.</p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Rating scale</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {draft.scale.map((item, index) => (
            <div key={item.value} className="flex items-center gap-2">
              <span className="w-8 text-center font-semibold">{item.value}</span>
              <Input
                value={item.label}
                onChange={(e) => onChange({
                  scale: draft.scale.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Written sections</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ sections: [...draft.sections, { id: newId(), title: '', required: false }] })}>
            <Plus className="h-4 w-4" /> Add section
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.sections.map((section) => (
            <div key={section.id} className="flex items-center gap-2">
              <Input
                value={section.title}
                onChange={(e) => onChange({
                  sections: draft.sections.map((row) => (row.id === section.id ? { ...row, title: e.target.value } : row)),
                })}
                placeholder="Section title"
              />
              <label className="flex items-center gap-1 text-sm whitespace-nowrap cursor-pointer">
                <Checkbox
                  checked={section.required}
                  onCheckedChange={(v) => onChange({
                    sections: draft.sections.map((row) => (row.id === section.id ? { ...row, required: v === true } : row)),
                  })}
                />
                Required
              </label>
              <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => onChange({ sections: draft.sections.filter((row) => row.id !== section.id) })} aria-label="Remove section">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {draft.sections.length === 0 && <p className="text-sm text-muted-foreground">No written sections.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3 space-y-2">
          <div className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Overall rating</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ bands: [...draft.bands, { min: 1, label: '' }] })}>
              <Plus className="h-4 w-4" /> Add rating
            </Button>
          </div>
          <p className="text-sm font-normal text-muted-foreground">
            This turns the average score into a rating name. The number is the lowest average that still gets that name. An average of 4.6 is Excellent because it is at least 4.5. An average of 3.8 is Very Good because it is at least 3.5 and below 4.5.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="hidden sm:grid grid-cols-[7rem_minmax(0,1fr)_2.5rem] gap-2 text-xs text-muted-foreground">
            <span>Lowest average</span>
            <span>Rating name</span>
          </div>
          {draft.bands.map((band, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-[7rem_minmax(0,1fr)_2.5rem] gap-2 sm:items-center">
              <Input
                type="number"
                step="0.1"
                aria-label="Lowest average"
                value={band.min}
                onChange={(e) => onChange({
                  bands: draft.bands.map((row, i) => (i === index ? { ...row, min: Number(e.target.value) } : row)),
                })}
              />
              <Input
                aria-label="Rating name"
                value={band.label}
                onChange={(e) => onChange({
                  bands: draft.bands.map((row, i) => (i === index ? { ...row, label: e.target.value } : row)),
                })}
                placeholder="e.g. Excellent"
              />
              <Button type="button" variant="ghost" size="icon" className="text-red-600" onClick={() => onChange({ bands: draft.bands.filter((_, i) => i !== index) })} aria-label="Remove rating">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={3}
            value={draft.recOptionsText}
            onChange={(e) => onChange({ recOptionsText: e.target.value })}
            placeholder={'One option per line, e.g.\nRecommend for Regularization\nDo Not Recommend for Regularization'}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={draft.recRequired} onCheckedChange={(v) => onChange({ recRequired: v === true })} />
            <span className="text-sm">Recommendation is required</span>
          </label>
          <p className="text-xs text-muted-foreground">Leave this empty if the form has no recommendation, such as the 3rd-month form.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewStep({
  draft,
  statusName,
  scheduleText,
  isNew,
}: {
  draft: Draft;
  statusName: (id: string) => string;
  scheduleText: string;
  isNew: boolean;
}) {
  const options = draft.recOptionsText.split('\n').map((x) => x.trim()).filter(Boolean);
  const rows: { label: string; value: string }[] = [
    { label: 'Form name', value: draft.name.trim() || '—' },
    { label: 'Description', value: draft.description.trim() || '—' },
    { label: 'Employment status', value: draft.statusIds.length ? draft.statusIds.map(statusName).join(', ') : '—' },
    { label: 'Schedule', value: `${SCHEDULE_LABEL[draft.scheduleType]} · ${scheduleText}` },
    { label: 'Factors', value: `${draft.factors.length} factor${draft.factors.length === 1 ? '' : 's'}` },
    { label: 'Written sections', value: draft.sections.length ? draft.sections.map((s) => s.title || 'Untitled').join(', ') : 'None' },
    { label: 'Rating scale', value: draft.scale.map((s) => `${s.value} ${s.label}`).join(', ') },
    { label: 'Overall rating', value: draft.bands.map((b) => `${b.min}+ ${b.label}`).join(', ') || '—' },
    { label: 'Recommendation', value: options.length ? options.join(', ') : 'None' },
    {
      label: 'Publishing',
      value: !draft.isActive
        ? 'Inactive'
        : draft.scheduleType !== 'manual' && draft.autoCreate
          ? 'Active. The system creates evaluations on schedule'
          : 'Active. You create evaluations by hand',
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Review</h2>
        <p className="text-sm text-muted-foreground">
          {isNew
            ? 'Saving creates the form. Active makes it available. Create evaluations automatically on schedule lets the system create them on their due dates.'
            : 'Evaluations already created keep the form they started with. New ones use this version.'}
        </p>
      </div>
      <Card>
        <CardContent className="pt-4 divide-y">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-1 sm:grid-cols-[180px_minmax(0,1fr)] gap-1 py-3 text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium break-words">{row.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default PerformanceFormBuilderPage;
