import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Search, ChevronRight, Plus, Timer, CalendarDays, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getWeekdayForDate } from '@/lib/attendanceStatus';
import { computeOTHours } from '@/lib/overtimeHours';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';

interface EmployeeOption {
  id: string;
  name: string;
  employee_code?: string | null;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const OvertimeOnBehalf = () => {
  const { user: currentUser } = useCurrentUser();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otAttachmentFile, setOtAttachmentFile] = useState<File | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [form, setForm] = useState({ ot_date: '', reason: '' });
  const [eligibleDates, setEligibleDates] = useState<{ date: string; hours: number }[]>([]);
  const [eligibleDatesLoading, setEligibleDatesLoading] = useState(false);
  const [otPreview, setOtPreview] = useState<{
    loading: boolean;
    valid: boolean;
    hours?: number;
    shiftEnd?: string;
    timeOut?: string;
    error?: string;
  }>({ loading: false, valid: false });

  const isAdmin = currentUser?.roles?.some((r) => r === 'super_admin' || r === 'admin') ?? false;

  useEffect(() => {
    const loadEmployees = async () => {
      if (!currentUser?.id) return;
      const ids = new Set<string>();
      if (isAdmin) {
        const { data } = await supabase
          .from('employees')
          .select('id, first_name, last_name, employee_code')
          .eq('is_active', true)
          .order('first_name');
        setEmployees(
          (data || [])
            .filter((e) => e.id !== currentUser.id)
            .map((e) => ({
              id: e.id as string,
              name: `${e.first_name} ${e.last_name}`,
              employee_code: e.employee_code as string | null,
            }))
        );
        return;
      }

      const { data: esData } = await supabase
        .from('employee_supervisors')
        .select('employee_id')
        .eq('supervisor_id', currentUser.id);
      (esData || []).forEach((r) => ids.add(r.employee_id));
      const { data: empData } = await supabase
        .from('employees')
        .select('id')
        .eq('supervisor_id', currentUser.id)
        .eq('is_active', true);
      (empData || []).forEach((r) => ids.add(r.id));
      ids.delete(currentUser.id);
      if (ids.size === 0) {
        setEmployees([]);
        return;
      }
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_code')
        .in('id', Array.from(ids))
        .eq('is_active', true)
        .order('first_name');
      setEmployees(
        (data || []).map((e) => ({
          id: e.id as string,
          name: `${e.first_name} ${e.last_name}`,
          employee_code: e.employee_code as string | null,
        }))
      );
    };
    loadEmployees();
  }, [currentUser?.id, isAdmin]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setSelectedEmployee(null);
      return;
    }
    setSelectedEmployee(employees.find((e) => e.id === selectedEmployeeId) || null);
  }, [selectedEmployeeId, employees]);

  const fetchEligibleDates = useCallback(async (employeeId: string) => {
    setEligibleDatesLoading(true);
    setEligibleDates([]);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [attRes, shiftRes, existingRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('date, time_in, time_out, status')
          .eq('employee_id', employeeId)
          .lte('date', today)
          .not('time_out', 'is', null),
        supabase
          .from('employee_shifts')
          .select('shift:shifts(end_time, days, is_flexible)')
          .eq('employee_id', employeeId),
        supabase
          .from('overtime_requests')
          .select('date')
          .eq('employee_id', employeeId)
          .in('status', ['pending', 'approved']),
      ]);

      const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
      const existingDates = new Set((existingRes.data || []).map((r: { date: string }) => r.date));
      const eligible: { date: string; hours: number }[] = [];

      for (const att of attRes.data || []) {
        if (att.status === 'absent' || existingDates.has(att.date)) continue;
        const weekday = getWeekdayForDate(att.date);
        const shiftForDay =
          shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
        if (shiftForDay?.is_flexible) continue;
        const shiftEnd = shiftForDay?.end_time ?? '19:00:00';
        const { valid, hours } = computeOTHours(att.time_out as string, shiftEnd, att.date);
        if (valid && hours >= 1) eligible.push({ date: att.date, hours });
      }
      eligible.sort((a, b) => b.date.localeCompare(a.date));
      setEligibleDates(eligible);
    } catch {
      setEligibleDates([]);
    } finally {
      setEligibleDatesLoading(false);
    }
  }, []);

  const fetchOtPreview = useCallback(async (employeeId: string, dateStr: string) => {
    if (!dateStr) {
      setOtPreview({ loading: false, valid: false });
      return;
    }
    setOtPreview((p) => ({ ...p, loading: true }));
    const weekday = getWeekdayForDate(dateStr);
    const [attRes, shiftRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('time_in, time_out, status')
        .eq('employee_id', employeeId)
        .eq('date', dateStr)
        .maybeSingle(),
      supabase
        .from('employee_shifts')
        .select('shift:shifts(end_time, days, is_flexible)')
        .eq('employee_id', employeeId),
    ]);

    const att = attRes.data;
    const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
    const shiftForDay =
      shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
    if (shiftForDay?.is_flexible) {
      setOtPreview({
        loading: false,
        valid: false,
        error: 'Automatic OT preview is disabled for flexible shifts.',
      });
      return;
    }
    const shiftEnd = shiftForDay?.end_time ?? '19:00:00';
    if (!att?.time_in) {
      setOtPreview({ loading: false, valid: false, error: 'No attendance record for this date' });
      return;
    }
    if (att.status === 'absent') {
      setOtPreview({ loading: false, valid: false, error: 'Cannot file OT when absent' });
      return;
    }
    if (!att.time_out) {
      setOtPreview({
        loading: false,
        valid: false,
        error: 'No time-out recorded. Time-out must be after shift end.',
      });
      return;
    }
    const { valid, hours, timeOutStr } = computeOTHours(att.time_out as string, shiftEnd, dateStr);
    setOtPreview({
      loading: false,
      valid,
      hours,
      shiftEnd,
      timeOut: timeOutStr,
      error: valid ? undefined : 'Minimum overtime is 1 hour',
    });
  }, []);

  useEffect(() => {
    setForm({ ot_date: '', reason: '' });
    setOtAttachmentFile(null);
    setOtPreview({ loading: false, valid: false });
    setEligibleDates([]);
    if (selectedEmployeeId) fetchEligibleDates(selectedEmployeeId);
  }, [selectedEmployeeId, fetchEligibleDates]);

  useEffect(() => {
    if (selectedEmployeeId && form.ot_date) {
      fetchOtPreview(selectedEmployeeId, form.ot_date);
    } else {
      setOtPreview({ loading: false, valid: false });
    }
  }, [selectedEmployeeId, form.ot_date, fetchOtPreview]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees.filter((e) => {
      const code = (e.employee_code || '').toLowerCase();
      return e.name.toLowerCase().includes(q) || code.includes(q);
    });
  }, [employees, employeeSearch]);

  const eligibleDateSet = useMemo(
    () => new Set(eligibleDates.map((e) => e.date)),
    [eligibleDates]
  );
  const eligibleDatesHours = useMemo(
    () => Object.fromEntries(eligibleDates.map((e) => [e.date, e.hours])),
    [eligibleDates]
  );

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
    if (!selectedEmployeeId) {
      toast.error('Please select an employee');
      return;
    }
    if (!form.ot_date) {
      toast.error('Please select OT date');
      return;
    }
    if (!form.reason?.trim()) {
      toast.error('Reason is required');
      return;
    }
    if (!otPreview.valid) {
      toast.error(otPreview.error || 'No eligible overtime for this date');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;
      if (otAttachmentFile) {
        const ext = otAttachmentFile.name.split('.').pop() || 'pdf';
        const path = `${currentUser.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('ot-attachments')
          .upload(path, otAttachmentFile, { upsert: false });
        if (uploadErr) {
          toast.error('Failed to upload attachment. Try again.');
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('ot-attachments').getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase.rpc('file_overtime_on_behalf', {
        p_employee_id: selectedEmployeeId,
        p_ot_date: form.ot_date,
        p_reason: form.reason.trim(),
        p_attachment_url: attachmentUrl,
      });

      if (error) {
        toast.error('Failed to file overtime on behalf');
        setSubmitting(false);
        return;
      }

      const result = data as { success: boolean; error?: string; id?: string; hours?: number };
      if (result?.success) {
        toast.success(
          result.hours != null
            ? `Overtime filed and auto-approved (${result.hours} hr)`
            : 'Overtime filed and auto-approved'
        );
        if (result.id) {
          sendRequestNotification({
            event: 'approved',
            requestType: 'overtime',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
          createRequestInAppNotification({
            event: 'approved',
            requestType: 'overtime',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
        }
        setForm({ ot_date: '', reason: '' });
        setOtAttachmentFile(null);
        setConfirmSubmitOpen(false);
        fetchEligibleDates(selectedEmployeeId);
      } else {
        toast.error(result?.error || 'Failed to file overtime on behalf');
      }
    } catch {
      toast.error('Failed to file overtime on behalf');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">File Overtime on Behalf</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? 'Select any employee and file overtime that is auto-approved and credited to CTO.'
            : 'File overtime for an employee under you. It will be auto-approved and credited to CTO.'}
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)] flex-1 min-h-0">
        <Card className="min-h-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Select Employee</span>
              <Badge variant="outline">{isAdmin ? 'HR Tool' : 'Team'}</Badge>
            </CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Search by name or employee code, then file OT on their behalf.'
                : 'Only employees assigned to you are listed.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name or employee code…"
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto rounded-md border divide-y">
              {filteredEmployees.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No employees found.</p>
              ) : (
                filteredEmployees.map((e) => {
                  const selected = selectedEmployeeId === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(e.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/60 transition-colors',
                        selected && 'bg-primary/5'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{e.name}</p>
                        {e.employee_code && (
                          <p className="text-xs text-muted-foreground">{e.employee_code}</p>
                        )}
                      </div>
                      <ChevronRight
                        className={cn('h-4 w-4 shrink-0 text-muted-foreground', selected && 'text-primary')}
                      />
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4" />
              Overtime Details
            </CardTitle>
            <CardDescription>
              Same rules as employee File OT. This request will be filed by you and auto-approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedEmployee ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Select an employee to continue.
              </p>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  Filing for{' '}
                  <span className="font-medium">{selectedEmployee.name}</span>
                  {selectedEmployee.employee_code && (
                    <span className="text-muted-foreground"> ({selectedEmployee.employee_code})</span>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>OT Date</Label>
                  {eligibleDatesLoading ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading dates with 1hr+ overtime…
                    </div>
                  ) : eligibleDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No dates with 1hr+ overtime. OT requires time-out at least 1 hour after shift end.
                    </p>
                  ) : (
                    <>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !form.ot_date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            {form.ot_date ? (
                              <>
                                {formatDate(form.ot_date)}
                                {eligibleDatesHours[form.ot_date] != null && (
                                  <span className="ml-2 text-muted-foreground">
                                    — {eligibleDatesHours[form.ot_date]} hr(s)
                                  </span>
                                )}
                              </>
                            ) : (
                              'Pick a date with eligible overtime'
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={form.ot_date ? new Date(form.ot_date + 'T12:00:00') : undefined}
                            onSelect={(date) =>
                              date && setForm((f) => ({ ...f, ot_date: toLocalDateStr(date) }))
                            }
                            disabled={(date) => {
                              const dateStr = toLocalDateStr(date);
                              const today = toLocalDateStr(new Date());
                              if (dateStr > today) return true;
                              return !eligibleDateSet.has(dateStr);
                            }}
                            toDate={new Date()}
                          />
                        </PopoverContent>
                      </Popover>
                      {form.ot_date && otPreview.valid && (
                        <p className="text-xs text-green-600">
                          Eligible: {otPreview.hours} hr(s)
                          {otPreview.timeOut && otPreview.shiftEnd
                            ? ` (out ${otPreview.timeOut} vs shift end ${otPreview.shiftEnd})`
                            : ''}
                        </p>
                      )}
                      {form.ot_date && !otPreview.loading && !otPreview.valid && otPreview.error && (
                        <p className="text-xs text-destructive">{otPreview.error}</p>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ot-reason">Reason</Label>
                  <Textarea
                    id="ot-reason"
                    rows={3}
                    placeholder="Reason for overtime…"
                    value={form.reason}
                    onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ot-attachment">Attachment (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="ot-attachment"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => setOtAttachmentFile(e.target.files?.[0] || null)}
                    />
                    {otAttachmentFile && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                        <Paperclip className="h-3 w-3" />
                        {otAttachmentFile.name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  You are filing as {isAdmin ? 'HR (admin)' : 'immediate superior'}. This OT will be
                  recorded under your name as filer and auto-approved.
                </div>

                <Button
                  className="w-full"
                  disabled={
                    submitting ||
                    !form.ot_date ||
                    !form.reason.trim() ||
                    !otPreview.valid ||
                    eligibleDatesLoading
                  }
                  onClick={() => setConfirmSubmitOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  File &amp; Auto-Approve OT
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm overtime filing</DialogTitle>
            <DialogDescription>
              File OT for {selectedEmployee?.name} on{' '}
              {form.ot_date ? formatDate(form.ot_date) : '—'}
              {otPreview.hours != null ? ` (${otPreview.hours} hr)` : ''}. This will be auto-approved
              and credited to their CTO balance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OvertimeOnBehalf;
