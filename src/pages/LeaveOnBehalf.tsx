import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEmployeeLeaveBalance } from '@/hooks/useEmployeeLeaveBalance';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Loader2, Calendar, Search, ChevronRight, CalendarX, Palmtree, HeartPulse, Briefcase, Baby, Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';
import type { LeaveBalance, LeaveTypeConfigForBalance } from '@/types';

interface EmployeeOption {
  id: string;
  name: string;
  employee_code?: string | null;
}

const ICON_BY_CODE: Record<string, React.ComponentType<{ className?: string }>> = {
  vl: Palmtree,
  sl: HeartPulse,
  pto: Briefcase,
  lwop: CalendarX,
  maternity: Baby,
  paternity: Baby,
};
const DEFAULT_ICON = Calendar;

const BORDER_BY_CODE: Record<string, string> = {
  vl: 'border-l-emerald-500',
  sl: 'border-l-rose-500',
  pto: 'border-l-amber-500',
  cto: 'border-l-sky-500',
  maternity: 'border-l-pink-500',
  paternity: 'border-l-blue-500',
  lwop: 'border-l-slate-400',
};

function getBalanceForType(balance: LeaveBalance | null, cfg: LeaveTypeConfigForBalance): number {
  if (!balance) return cfg.annual_entitlement ?? 0;
  if (cfg.code === 'lwop') return Number(balance.lwop_days_used ?? 0);
  if (cfg.code === 'vl') return Number(balance.vl_balance ?? 0);
  if (cfg.code === 'sl') return Number(balance.sl_balance ?? 0);
  if (cfg.code === 'pto') return Number(balance.pto_balance ?? 0);
  return Number(balance.balances?.[cfg.code] ?? cfg.annual_entitlement ?? 0);
}

const DURATION_TYPES = [
  { value: 'fullday', label: 'Full Day' },
  { value: 'first_half', label: 'First Half' },
  { value: 'second_half', label: 'Second Half' },
] as const;

const LeaveOnBehalf = () => {
  const { user: currentUser } = useCurrentUser();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slAttachmentFile, setSlAttachmentFile] = useState<File | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  const [form, setForm] = useState<{
    leave_type: string;
    start_date: string;
    end_date: string;
    leave_duration_type: 'fullday' | 'first_half' | 'second_half';
    reason: string;
  }>({
    leave_type: 'vl',
    start_date: '',
    end_date: '',
    leave_duration_type: 'fullday',
    reason: '',
  });

  const { balance, eligibleLeaveTypes, isRegular, loading: balanceLoading } =
    useEmployeeLeaveBalance(selectedEmployeeId);

  useEffect(() => {
    const loadEmployees = async () => {
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_code')
        .eq('is_active', true)
        .order('first_name');
      const opts =
        (data || []).map((e: any) => ({
          id: e.id as string,
          name: `${e.first_name} ${e.last_name}`,
          employee_code: e.employee_code as string | null,
        })) ?? [];
      setEmployees(opts);
    };
    loadEmployees();
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setSelectedEmployee(null);
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId) || null;
    setSelectedEmployee(emp);
  }, [selectedEmployeeId, employees]);

  const fileLeaveOptions = useMemo(() => {
    const defaultTypes: LeaveTypeConfigForBalance[] = [
      { code: 'vl', name: 'Vacation Leave', annual_entitlement: 15, cap: 30, is_system: true },
      { code: 'sl', name: 'Sick Leave', annual_entitlement: 15, cap: null, is_system: true },
      { code: 'pto', name: 'Personal Time Off', annual_entitlement: 7, cap: null, is_system: true },
      { code: 'lwop', name: 'Leave Without Pay', annual_entitlement: 0, cap: null, is_system: true },
    ];
    const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : defaultTypes;
    return isRegular ? types : types.filter((t) => t.code === 'lwop');
  }, [eligibleLeaveTypes, isRegular]);

  useEffect(() => {
    if (fileLeaveOptions.length > 0) {
      setForm((f) => ({
        ...f,
        leave_type: fileLeaveOptions[0].code,
      }));
    }
  }, [fileLeaveOptions]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees.filter((e) => {
      const code = (e.employee_code || '').toLowerCase();
      return e.name.toLowerCase().includes(q) || code.includes(q);
    });
  }, [employees, employeeSearch]);

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
    if (!selectedEmployeeId) {
      toast.error('Please select an employee');
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Please select start and end dates');
      return;
    }
    if (form.start_date > form.end_date) {
      toast.error('End date must be on or after start date');
      return;
    }
    if (!form.reason?.trim()) {
      toast.error('Reason is required');
      return;
    }

    const leaveType = !isRegular ? 'lwop' : form.leave_type;

    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;
      if (leaveType === 'sl' && slAttachmentFile && selectedEmployeeId) {
        const ext = slAttachmentFile.name.split('.').pop() || 'pdf';
        const path = `${selectedEmployeeId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('sl-attachments')
          .upload(path, slAttachmentFile, { upsert: false });
        if (uploadErr) {
          toast.error('Failed to upload attachment. Try again.');
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('sl-attachments').getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }

      const { data, error } = await supabase.rpc('admin_file_leave_on_behalf', {
        p_employee_id: selectedEmployeeId,
        p_leave_type: leaveType,
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_leave_duration_type: form.leave_duration_type,
        p_reason: form.reason || null,
        p_attachment_url: attachmentUrl,
      });

      if (error) {
        toast.error('Failed to file leave on behalf');
        setSubmitting(false);
        return;
      }

      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Leave filed and auto-approved');
        if (result.id) {
          // Treat this as an approved leave for notifications
          sendRequestNotification({
            event: 'approved',
            requestType: 'leave',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
          createRequestInAppNotification({
            event: 'approved',
            requestType: 'leave',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
        }
        setForm({
          leave_type: fileLeaveOptions[0]?.code ?? 'vl',
          start_date: '',
          end_date: '',
          leave_duration_type: 'fullday',
          reason: '',
        });
        setSlAttachmentFile(null);
      } else {
        toast.error(result?.error || 'Failed to file leave on behalf');
      }
    } catch {
      toast.error('Failed to file leave on behalf');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">File Leave on Behalf</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select an employee, review their leave balances, and file a leave request that is auto-approved. VL/SL notice
          rules are bypassed for HR use.
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)] flex-1 min-h-0">
        <div className="flex flex-col gap-4 min-h-0">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Select Employee</span>
                <Badge variant="outline">HR Tool</Badge>
              </CardTitle>
              <CardDescription>Search by name or employee code, then file leave on their behalf.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search employee by name or code"
                  className="pl-9"
                />
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {filteredEmployees.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">No matching employees</div>
                ) : (
                  filteredEmployees.map((e) => {
                    const active = e.id === selectedEmployeeId;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedEmployeeId(e.id)}
                        className={cn(
                          'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors',
                          active && 'bg-primary/5 text-primary'
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{e.name}</span>
                          {e.employee_code && (
                            <span className="text-xs text-muted-foreground">Code: {e.employee_code}</span>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })
                )}
              </div>
              {selectedEmployee && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Filing leave for{' '}
                  <span className="font-medium text-foreground">
                    {selectedEmployee.name}
                    {selectedEmployee.employee_code ? ` (${selectedEmployee.employee_code})` : ''}
                  </span>
                  .
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Leave Details
              </CardTitle>
              <CardDescription>
                Set leave type, dates, and reason. This leave will be auto-approved and reflected in balances and
                attendance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedEmployeeId && (
                <p className="text-sm text-muted-foreground">
                  Select an employee first to view their balances and file a leave request.
                </p>
              )}
              {selectedEmployeeId && (
                <>
                  <div className="space-y-2">
                    <Label>Leave Type</Label>
                    <Select
                      value={!isRegular && !fileLeaveOptions.some((t) => t.code === form.leave_type) ? 'lwop' : form.leave_type}
                      onValueChange={(v) => setForm((f) => ({ ...f, leave_type: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        {fileLeaveOptions.map((t) => (
                          <SelectItem key={t.code} value={t.code}>
                            {['vl', 'sl', 'pto', 'lwop'].includes(t.code)
                              ? `${t.name} (${t.code.toUpperCase()})`
                              : t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const leaveType = !isRegular ? 'lwop' : form.leave_type;
                      if (leaveType === 'lwop') return null;
                      const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : fileLeaveOptions;
                      const cfg = types.find((c) => c.code === leaveType);
                      if (!cfg) return null;
                      const remaining =
                        leaveType === 'vl'
                          ? balance?.vl_balance ?? cfg.annual_entitlement
                          : leaveType === 'sl'
                            ? balance?.sl_balance ?? cfg.annual_entitlement
                            : leaveType === 'pto'
                              ? balance?.pto_balance ?? cfg.annual_entitlement
                              : Number(balance?.balances?.[leaveType] ?? cfg.annual_entitlement);
                      const total = cfg.cap ?? cfg.annual_entitlement;
                      return (
                        <p className="text-xs text-muted-foreground">
                          Remaining {cfg.name}:{' '}
                          <span className="font-medium text-foreground">
                            {remaining}
                            {total != null && cfg.code !== 'lwop' ? ` of ${total} days` : ' days'}
                          </span>
                          .
                        </p>
                      );
                    })()}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={form.start_date}
                        onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={form.end_date}
                        onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={form.leave_duration_type}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, leave_duration_type: v as 'fullday' | 'first_half' | 'second_half' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_TYPES.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Reason</Label>
                    <Textarea
                      value={form.reason}
                      onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                      rows={3}
                      placeholder="Provide a brief reason for this leave request"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Attachment (optional, SL/medical)</Label>
                    <Input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setSlAttachmentFile(file);
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      You can attach a medical certificate or supporting file. This is especially useful for same-day SL.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t mt-2">
                    <p className="text-xs text-muted-foreground max-w-[70%]">
                      This request will be filed on behalf of the selected employee, auto-approved, and applied to leave
                      balances and attendance. VL 7-day and SL 2-hour notice rules are bypassed.
                    </p>
                    <Button
                      type="button"
                      onClick={() => setConfirmSubmitOpen(true)}
                      disabled={submitting || !selectedEmployeeId}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Filing...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          File Leave
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <Card className="shrink-0">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Leave Balances
              </CardTitle>
              <CardDescription>
                View the selected employee&apos;s remaining leave credits for the current year.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedEmployeeId ? (
                <p className="text-sm text-muted-foreground">
                  Select an employee to view their leave balances.
                </p>
              ) : balanceLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !balance && fileLeaveOptions.filter((t) => t.code !== 'lwop').length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No leave balance information found. You can still file LWOP on behalf of this employee.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
                    {fileLeaveOptions.filter((t) => t.code !== 'lwop').map((cfg) => {
                      const val = getBalanceForType(balance, cfg);
                      const label = ['vl', 'sl', 'pto'].includes(cfg.code) ? cfg.code.toUpperCase() : cfg.name;
                      const maxVal = cfg.cap ?? cfg.annual_entitlement;
                      const Icon = ICON_BY_CODE[cfg.code] || DEFAULT_ICON;
                      const borderCls = BORDER_BY_CODE[cfg.code] || 'border-l-slate-400';
                      const isLow = cfg.code !== 'lwop' && val <= 3;
                      const percent = maxVal ? Math.min(100, Math.max(0, (Number(val) / maxVal) * 100)) : null;
                      return (
                        <div
                          key={cfg.code}
                          className={cn(
                            'rounded-lg border border-l-4 bg-card px-4 py-3 flex flex-col gap-1 hover:bg-muted/30 transition-colors',
                            borderCls,
                            isLow && 'ring-1 ring-amber-200'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                                {label}
                              </span>
                            </div>
                            {maxVal != null && cfg.code !== 'lwop' && (
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {val} / {maxVal} days
                              </span>
                            )}
                          </div>
                          {maxVal != null && cfg.code !== 'lwop' && (
                            <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${percent ?? 0}%` }}
                              />
                            </div>
                          )}
                          {maxVal == null || cfg.code === 'lwop' ? (
                            <span className="text-sm font-semibold tabular-nums">{val} days</span>
                          ) : null}
                        </div>
                      );
                    })}
                    {fileLeaveOptions.some((t) => t.code === 'lwop') && (
                      <div className="rounded-lg border border-l-4 border-l-slate-400 bg-card px-4 py-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CalendarX className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium text-foreground">LWOP used</span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">
                          {balance?.lwop_days_used ?? 0} days
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={confirmSubmitOpen} onOpenChange={(open) => setConfirmSubmitOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Leave Filing</DialogTitle>
            <DialogDescription>
              Are you sure you want to confirm this leave on behalf of the selected employee? It will be auto-approved
              and reflected in their balances and attendance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirmSubmitOpen(false);
                await handleSubmit();
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Yes, confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeaveOnBehalf;

