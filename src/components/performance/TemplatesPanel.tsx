import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Pencil, Play, Plus, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { scheduleSummary, type FormTemplate } from '@/lib/performance';

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
                <p className="text-xs text-muted-foreground">They also get a notice on the due date, then every day it stays overdue.</p>
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
            <Button variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Create due evaluations now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Forms */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Evaluation forms ({templates.length})</CardTitle>
          <Button
            onClick={() => navigate('/dashboard/performance/forms/new')}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Plus className="h-4 w-4 mr-2" /> New Form
          </Button>
        </CardHeader>
        <CardContent>
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
              {templates.map((t) => (
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
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No forms yet. Create one for probation (3rd and 5th month).
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
