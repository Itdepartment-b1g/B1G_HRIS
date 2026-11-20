import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Pencil, Play, Plus, Save, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  errorMessage,
  loadEmploymentStatuses,
  loadPerformanceSettings,
  type EmploymentStatusOption,
  type PerformanceSettings,
} from '@/lib/performanceData';
import { formatDate, scheduleSummary, type FormTemplate } from '@/lib/performance';
import { flushPerformanceEmails } from '@/lib/edgeFunctions';

interface TemplatesPanelProps {
  templates: FormTemplate[];
  userId: string | null;
  onChanged: () => void;
}

export function TemplatesPanel({ templates, userId, onChanged }: TemplatesPanelProps) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<EmploymentStatusOption[]>([]);

  const [settings, setSettings] = useState<PerformanceSettings | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirmRunOpen, setConfirmRunOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  useEffect(() => {
    loadEmploymentStatuses().then(setStatuses).catch((e) => toast.error(errorMessage(e)));
    loadPerformanceSettings().then(setSettings).catch((e) => toast.error(errorMessage(e)));
    supabase
      .from('departments')
      .select('id, name')
      .order('name')
      .then(({ data }) => setDepartments(data || []));
  }, []);

  const statusName = (id: string) => statuses.find((s) => s.id === id)?.name ?? 'Unknown';

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((t) => {
      const statusesText = t.applies_to_status_ids.map(statusName).join(' ');
      return [t.name, t.description, scheduleSummary(t), statusesText, t.is_active ? 'active' : 'inactive']
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [templates, search, statuses]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  const pagedTemplates = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTemplates.slice(start, start + pageSize);
  }, [filteredTemplates, page, pageSize]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const { error } = await supabase
      .from('performance_settings')
      .update({
        hr_department_id: settings.hr_department_id,
        reminder_days_before: settings.reminder_days_before,
        go_live_date: settings.go_live_date,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSavingSettings(false);
    if (error) return toast.error(errorMessage(error, 'Could not save settings'));
    toast.success('Performance settings saved');
    onChanged();
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.rpc('performance_run_daily');
    setRunning(false);
    if (error) return toast.error(errorMessage(error, 'Could not run schedule'));
    const result = data as { evaluations_created?: number; reminders_sent?: number } | null;
    toast.success(`Schedule ran: ${result?.evaluations_created ?? 0} created, ${result?.reminders_sent ?? 0} reminders sent`);
    flushPerformanceEmails().catch(() => {});
    onChanged();
  };

  return (
    <div className="space-y-6">
      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Who can sign as HR</Label>
                <Select
                  value={settings.hr_department_id ?? '_none'}
                  onValueChange={(v) => setSettings({ ...settings, hr_department_id: v === '_none' ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Only employees in this department appear in the HR signer list.</p>
              </div>
              <div className="space-y-2">
                <Label>Days to warn the evaluator early</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={settings.reminder_days_before}
                  onChange={(e) => setSettings({ ...settings, reminder_days_before: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">They also get a notice on the due date, then every day it stays overdue. The same number of days is used once to remind HR, admin, and super admin when a probationary evaluation still needs to be created.</p>
              </div>
              <div className="space-y-2">
                <Label>Start creating evaluations from</Label>
                <Input
                  type="date"
                  value={settings.go_live_date}
                  onChange={(e) => setSettings({ ...settings, go_live_date: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Due dates before this day are skipped, so old hires are not marked overdue on the first run.</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveSettings} disabled={savingSettings || !settings} className="bg-primary hover:bg-primary/90 text-white">
              {savingSettings ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save settings
            </Button>
            <Button variant="outline" onClick={() => setConfirmRunOpen(true)} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Create due evaluations now
            </Button>
            <AlertDialog open={confirmRunOpen} onOpenChange={setConfirmRunOpen}>
              <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <AlertDialogHeader>
                  <AlertDialogTitle>Create evaluations now?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm text-muted-foreground">
                      <p>
                        This runs the same job the system runs every night. Evaluations it creates cannot be removed with one click. Each one can be cancelled separately later.
                      </p>
                      <div className="space-y-2">
                        <p className="font-medium text-foreground">What it will do</p>
                        <ol className="list-decimal pl-5 space-y-1">
                          <li>
                            For each form with <span className="font-medium text-foreground">Create evaluations automatically on schedule</span> turned on, it creates the evaluations that are due.
                          </li>
                          <li>
                            Only due dates on or after <span className="font-medium text-foreground">{formatDate(settings?.go_live_date ?? null)}</span> are used. Earlier due dates are skipped, so older hires are not marked overdue.
                          </li>
                          <li>
                            It creates them now, even if the due date is months away. They wait until their due date.
                          </li>
                          <li>
                            If an evaluation already exists for that person and due date, it is not created again.
                          </li>
                          <li>
                            Probation forms with the automatic setting off do not create anything. Instead, HR, admin, and super admin get one reminder for each person whose evaluation is due in {settings?.reminder_days_before ?? 7} days and still has not been created.
                          </li>
                        </ol>
                      </div>
                      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                        <p className="font-medium text-foreground">Example</p>
                        <p>
                          An employee hired on August 19, 2026 has a 3rd-month evaluation due November 19, 2026 and a 5th-month evaluation due January 19, 2027. If the probation form is set to create automatically, clicking now creates both today. The January one is created two months early, and it waits until January 19, 2027 to be due.
                        </p>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={runNow} disabled={running}>
                    Create evaluations now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Forms */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Evaluation forms ({filteredTemplates.length})</CardTitle>
          <Button
            onClick={() => navigate('/dashboard/performance/forms/new')}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> New Form
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search form name, status, or schedule..."
              className="pl-10"
            />
          </div>
          <div className="md:hidden space-y-3">
            {pagedTemplates.map((t) => (
              <div key={t.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium leading-tight">{t.name}</p>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => navigate(`/dashboard/performance/forms/${t.id}`)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">For employment status</dt>
                    <dd>{t.applies_to_status_ids.length ? t.applies_to_status_ids.map(statusName).join(', ') : <span className="text-amber-700">None selected</span>}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Schedule</dt>
                    <dd>{scheduleSummary(t)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Version</dt>
                    <dd>v{t.version}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">State</dt>
                    <dd className="mt-1">
                      <Badge variant="outline" className={t.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">
                {search.trim() ? 'No forms match your search.' : 'No forms yet. Create one for probation (3rd and 5th month).'}
              </p>
            )}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>For employment status</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedTemplates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-sm">{t.name}</TableCell>
                  <TableCell className="text-sm">
                    {t.applies_to_status_ids.length ? t.applies_to_status_ids.map(statusName).join(', ') : <span className="text-amber-700">None selected</span>}
                  </TableCell>
                  <TableCell className="text-sm">{scheduleSummary(t)}</TableCell>
                  <TableCell className="text-sm">v{t.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={t.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => navigate(`/dashboard/performance/forms/${t.id}`)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTemplates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {search.trim() ? 'No forms match your search.' : 'No forms yet. Create one for probation (3rd and 5th month).'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
          <TablePagination
            totalItems={filteredTemplates.length}
            currentPage={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
