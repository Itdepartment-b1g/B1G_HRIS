import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AssignmentFields } from '@/components/performance/AssignmentFields';
import { loadPeopleDirectory, errorMessage, type PeopleDirectory } from '@/lib/performanceData';
import { flushPerformanceEmails } from '@/lib/edgeFunctions';
import { formatDate, type FormTemplate } from '@/lib/performance';

interface ExistingEvaluation {
  employee_id: string;
  due_date: string;
  period_label: string;
  status: string;
}

interface CreateEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: FormTemplate[];
  onCreated: () => void;
}

export function CreateEvaluationDialog({ open, onOpenChange, templates, onCreated }: CreateEvaluationDialogProps) {
  const [directory, setDirectory] = useState<PeopleDirectory | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [templateId, setTemplateId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [evaluatorIds, setEvaluatorIds] = useState<string[]>([]);
  const [hrSignerIds, setHrSignerIds] = useState<string[]>([]);
  const [existing, setExisting] = useState<ExistingEvaluation[]>([]);

  const activeTemplates = useMemo(() => templates.filter((t) => t.is_active), [templates]);
  const template = activeTemplates.find((t) => t.id === templateId) ?? null;
  const hrConfigured = !!directory?.hrDepartmentId;
  const single = selectedIds.length === 1;

  // Only employees whose current employment status is selected on the form
  const eligibleEmployees = useMemo(() => {
    if (!directory || !template) return [];
    return directory.employees.filter(
      (e) => e.employment_status_id && template.applies_to_status_ids.includes(e.employment_status_id)
    );
  }, [directory, template]);

  const existingByEmployee = useMemo(() => {
    const map = new Map<string, ExistingEvaluation[]>();
    for (const row of existing) {
      const list = map.get(row.employee_id) ?? [];
      list.push(row);
      map.set(row.employee_id, list);
    }
    return map;
  }, [existing]);

  const takenOnDueDate = useMemo(() => {
    if (!dueDate) return new Set<string>();
    return new Set(existing.filter((row) => row.due_date === dueDate).map((row) => row.employee_id));
  }, [existing, dueDate]);

  const visibleEmployees = useMemo(
    () => eligibleEmployees.filter((e) => !takenOnDueDate.has(e.id)),
    [eligibleEmployees, takenOnDueDate]
  );

  useEffect(() => {
    if (!open) return;
    setTemplateId('');
    setSelectedIds([]);
    setPeriodLabel('');
    setPeriodFrom('');
    setPeriodTo('');
    setDueDate('');
    setEvaluatorIds([]);
    setHrSignerIds([]);
    setExisting([]);
    setProgress(null);
    loadPeopleDirectory()
      .then(setDirectory)
      .catch((err) => toast.error(errorMessage(err, 'Failed to load employees')));
  }, [open]);

  useEffect(() => {
    if (!open || !templateId) {
      setExisting([]);
      return;
    }
    let cancelled = false;
    supabase
      .from('performance_evaluations')
      .select('employee_id, due_date, period_label, status')
      .eq('template_id', templateId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(errorMessage(error, 'Could not check existing evaluations'));
          setExisting([]);
          return;
        }
        setExisting((data ?? []) as ExistingEvaluation[]);
      });
    return () => { cancelled = true; };
  }, [open, templateId]);

  useEffect(() => {
    setSelectedIds((cur) => cur.filter((id) => !takenOnDueDate.has(id)));
  }, [takenOnDueDate]);

  // One employee selected: default evaluators to that employee's immediate superiors
  useEffect(() => {
    if (directory && selectedIds.length === 1) {
      setEvaluatorIds(directory.superiorsOf(selectedIds[0]).map((s) => s.id));
    } else {
      setEvaluatorIds([]);
    }
  }, [selectedIds, directory]);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = activeTemplates.find((x) => x.id === id);
    if (t && !periodLabel) setPeriodLabel(t.name);
    // Drop selected employees who do not match this form
    if (directory && t) {
      setSelectedIds((cur) =>
        cur.filter((empId) => {
          const emp = directory.byId.get(empId);
          return !!emp?.employment_status_id && t.applies_to_status_ids.includes(emp.employment_status_id);
        })
      );
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return toast.error('Choose a form');
    if (selectedIds.length === 0) return toast.error('Select at least one employee');
    if (!dueDate) return toast.error('Set the due date');
    if (!periodLabel.trim()) return toast.error('Enter the period label');
    if (single && evaluatorIds.length === 0) return toast.error('Select at least one evaluator');
    if (hrSignerIds.length === 0) return toast.error('Select at least one HR signer');

    setSaving(true);
    const failures: string[] = [];
    let created = 0;

    for (let i = 0; i < selectedIds.length; i += 1) {
      const empId = selectedIds[i];
      setProgress({ done: i, total: selectedIds.length });
      const emp = directory?.byId.get(empId);
      const { error } = await supabase.rpc('performance_create_evaluation', {
        p_template_id: template.id,
        p_employee_id: empId,
        p_due_date: dueDate,
        p_period_label: periodLabel.trim(),
        // Blank period from = each employee's own date hired
        p_period_from: periodFrom || emp?.hired_date || null,
        p_period_to: periodTo || dueDate,
        // One employee: use the evaluators picked here. Many: each employee's own superiors.
        p_evaluator_ids: single ? evaluatorIds : null,
        p_hr_signer_ids: hrSignerIds,
      });
      if (error) failures.push(`${emp?.name ?? 'Employee'}: ${errorMessage(error, 'not created')}`);
      else created += 1;
    }

    setProgress(null);
    setSaving(false);

    if (created > 0) {
      toast.success(`Created ${created} evaluation${created === 1 ? '' : 's'}`);
      onCreated();
      flushPerformanceEmails().catch(() => {});
    }
    if (failures.length > 0) {
      toast.error(`${failures.length} not created. ${failures.join(' | ')}`);
    } else {
      onOpenChange(false);
    }
  };

  const evaluatorOptions = single && directory ? directory.superiorsOf(selectedIds[0]) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Create Evaluation
          </DialogTitle>
          <DialogDescription>
            Tick one or more employees, and one evaluation is created for each. Forms set to create evaluations automatically on schedule create their own on the due dates, so you only use this for the rest.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>Form (what this evaluation is for)</Label>
            <Select value={templateId || '_none'} onValueChange={(v) => pickTemplate(v === '_none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— Select —</SelectItem>
                {activeTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Employees</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!template || visibleEmployees.length === 0}
                  onClick={() => setSelectedIds(visibleEmployees.map((e) => e.id))}
                >
                  Select all
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={selectedIds.length === 0} onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1">
              {!template ? (
                <p className="text-sm text-muted-foreground">Choose a form first.</p>
              ) : eligibleEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active employees have a status selected on this form.</p>
              ) : visibleEmployees.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everyone with this status already has an evaluation on this due date.</p>
              ) : (
                visibleEmployees.map((e) => {
                  const prior = existingByEmployee.get(e.id) ?? [];
                  return (
                    <label key={e.id} className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                      <Checkbox className="mt-0.5" checked={selectedIds.includes(e.id)} onCheckedChange={() => toggleEmployee(e.id)} />
                      <span className="min-w-0">
                        <span className="text-sm">{e.name}</span>
                        <span className="text-xs text-muted-foreground"> ({e.employee_code})</span>
                        {prior.length > 0 && (
                          <span className="block text-xs text-amber-700">
                            Already has {prior.map((row) => `${row.period_label}, due ${formatDate(row.due_date)}${row.status === 'cancelled' ? ', cancelled' : ''}`).join('; ')}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Period label</Label>
            <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. 3rd Month" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Period from</Label>
              <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period to</Label>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave Period from blank to use each employee&apos;s date hired. After you set a due date, people who already have this form on that date are hidden. A different due date, such as the 5th month, still shows them.
          </p>

          {selectedIds.length > 0 && (
            <AssignmentFields
              showEvaluators={single}
              evaluatorNote="Each selected employee&apos;s immediate superiors will be their evaluators. Employees with no immediate superior are created unassigned, and HR can assign one later."
              evaluatorOptions={evaluatorOptions}
              evaluatorIds={evaluatorIds}
              onEvaluatorIdsChange={setEvaluatorIds}
              hrOptions={directory?.hrOptions ?? []}
              hrSignerIds={hrSignerIds}
              onHrSignerIdsChange={setHrSignerIds}
              hrConfigured={hrConfigured}
            />
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || selectedIds.length === 0}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saving && progress
                ? `Creating ${progress.done + 1} of ${progress.total}…`
                : `Create ${selectedIds.length} evaluation${selectedIds.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
