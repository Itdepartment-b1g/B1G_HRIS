import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { Loader2, Plus, FileText, RefreshCw, Calendar, Palmtree, HeartPulse, Briefcase, CalendarX, ChevronRight, Eye, Paperclip, Baby, Clock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getWeekdayForDate } from '@/lib/attendanceStatus';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';
import type { LeaveBalance, LeaveRequest, LeaveTypeConfigForBalance } from '@/types';
import { useEmployeeLeaveBalance } from '@/hooks/useEmployeeLeaveBalance';
import LeaveApprovals from './LeaveApprovals';

const ICON_BY_CODE: Record<string, React.ComponentType<{ className?: string }>> = {
  vl: Palmtree,
  sl: HeartPulse,
  pto: Briefcase,
  lwop: CalendarX,
  cto: Clock,
  maternity: Baby,
  paternity: Baby,
};
const DEFAULT_ICON = Calendar;

/** Per-type color accent (left border) for balance cards */
const BORDER_BY_CODE: Record<string, string> = {
  vl: 'border-l-emerald-500',
  sl: 'border-l-rose-500',
  pto: 'border-l-amber-500',
  cto: 'border-l-sky-500',
  maternity: 'border-l-pink-500',
  paternity: 'border-l-blue-500',
  lwop: 'border-l-slate-400',
};

const DURATION_TYPES = [
  { value: 'fullday', label: 'Full Day' },
  { value: 'first_half', label: 'First Half' },
  { value: 'second_half', label: 'Second Half' },
] as const;

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMinDateForVL(): string {
  const d = new Date();
  d.setDate(d.getDate() + 8);
  return d.toISOString().slice(0, 10);
}

/** Parse "08:00:00" or "09:30" to { hours, minutes } */
function parseTimeToParts(timeStr: string): { h: number; m: number } {
  const parts = (timeStr || '08:00').toString().split(':').map(Number);
  return { h: parts[0] ?? 8, m: parts[1] ?? 0 };
}

/** Subtract 2 hours from start_time, return formatted "H:MM AM/PM" */
function getSLDeadlineFormatted(shiftStartTime: string): string {
  const { h, m } = parseTimeToParts(shiftStartTime);
  let deadlineM = h * 60 + m - 120;
  if (deadlineM < 0) deadlineM += 24 * 60;
  const dh = Math.floor(deadlineM / 60);
  const dm = deadlineM % 60;
  const d = new Date(2000, 0, 1, dh, dm);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Check if current time is past (shift_start - 2 hours) */
function isPastSLDeadline(shiftStartTime: string): boolean {
  const { h, m } = parseTimeToParts(shiftStartTime);
  let deadlineM = h * 60 + m - 120;
  if (deadlineM < 0) deadlineM += 24 * 60;
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  return nowM > deadlineM;
}

/** Count days between start and end, excluding Sundays only. */
function getBalanceForType(
  balance: LeaveBalance | null,
  cfg: LeaveTypeConfigForBalance
): number {
  if (!balance) return cfg.annual_entitlement ?? 0;
  if (cfg.code === 'lwop') return Number(balance.lwop_days_used ?? 0);
  if (cfg.code === 'vl') return Number(balance.vl_balance ?? 0);
  if (cfg.code === 'sl') return Number(balance.sl_balance ?? 0);
  if (cfg.code === 'pto') return Number(balance.pto_balance ?? 0);
  return Number(balance.balances?.[cfg.code] ?? cfg.annual_entitlement ?? 0);
}

function countDaysExcludingSunday(startStr: string, endStr: string, durationType: string): number | null {
  if (!startStr || !endStr || startStr > endStr) return null;
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (d.getDay() !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  const factor = durationType === 'fullday' ? 1 : 0.5;
  return count * factor;
}

const Leave = () => {
  const { user: currentUser } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<LeaveRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isRegular, setIsRegular] = useState<boolean>(true);
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('');
  const [shiftForSLDate, setShiftForSLDate] = useState<{ start_time: string } | null>(null);
  const [slAttachmentFile, setSlAttachmentFile] = useState<File | null>(null);
  const [eligibleLeaveTypes, setEligibleLeaveTypes] = useState<LeaveTypeConfigForBalance[]>([]);
  const [leavePage, setLeavePage] = useState(1);
  const [selectedApprovalLeaveType, setSelectedApprovalLeaveType] = useState<string>('');
  const tabParam = searchParams.get('tab');
  const [mainTab, setMainTab] = useState<'leave' | 'approval'>(() =>
    tabParam === 'approval' ? 'approval' : 'leave'
  );
  useEffect(() => {
    if (tabParam === 'approval') setMainTab('approval');
  }, [tabParam]);

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

  const { balance: hookBalance, eligibleLeaveTypes: hookEligibleTypes, isRegular: hookIsRegular } =
    useEmployeeLeaveBalance(currentUser?.id);

  useEffect(() => {
    setBalance(hookBalance);
  }, [hookBalance]);

  useEffect(() => {
    setEligibleLeaveTypes(hookEligibleTypes);
  }, [hookEligibleTypes]);

  useEffect(() => {
    setIsRegular(hookIsRegular);
  }, [hookIsRegular]);

  const fetchMyRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('leave_requests')
      .select('*, approver:employees!approved_by(first_name, last_name)')
      .eq('employee_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const withApprover = (data || []).map((r: any) => ({
      ...r,
      approver_name: r.approver ? `${r.approver.first_name} ${r.approver.last_name}` : null,
    }));
    setMyRequests(withApprover as LeaveRequest[]);
  }, [currentUser?.id]);

  const fetchAll = useCallback(() => {
    setLoading(true);
    fetchMyRequests().finally(() => setLoading(false));
  }, [fetchMyRequests]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('leave-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_requests', filter: `employee_id=eq.${currentUser.id}` },
        () => {
          fetchMyRequests();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_balances', filter: `employee_id=eq.${currentUser.id}` },
        () => {
          // Balance hook listens to Supabase changes; no-op here.
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_type_config' }, () => {
        // Balance hook listens to Supabase changes; no-op here.
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_type_eligibility' }, () => {
        // Balance hook listens to Supabase changes; no-op here.
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchMyRequests]);

  const fetchShiftForDate = useCallback(async (dateStr: string) => {
    if (!currentUser?.id || !dateStr) {
      setShiftForSLDate(null);
      return;
    }
    const weekday = getWeekdayForDate(dateStr);
    const { data } = await supabase
      .from('employee_shifts')
      .select('shift:shifts(start_time, days)')
      .eq('employee_id', currentUser.id);
    const shifts = (data || []).map((s: any) => s.shift).filter(Boolean);
    const shiftForDay = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
    if (shiftForDay?.start_time) {
      setShiftForSLDate({ start_time: shiftForDay.start_time });
    } else {
      setShiftForSLDate({ start_time: '08:00:00' });
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (fileDialogOpen && form.leave_type === 'sl' && form.start_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (form.start_date === today) {
        fetchShiftForDate(form.start_date);
      } else {
        setShiftForSLDate(null);
      }
    } else {
      setShiftForSLDate(null);
    }
  }, [fileDialogOpen, form.leave_type, form.start_date, fetchShiftForDate]);

  const filterByType = <T extends { leave_type?: string }>(list: T[]) =>
    !selectedLeaveType ? list : list.filter((r) => (r.leave_type || '').toLowerCase() === selectedLeaveType);

  const filteredMyRequests = useMemo(() => filterByType(myRequests), [myRequests, selectedLeaveType]);

  const defaultTypes: LeaveTypeConfigForBalance[] = [
    { code: 'vl', name: 'Vacation Leave', annual_entitlement: 15, cap: 30, is_system: true },
    { code: 'sl', name: 'Sick Leave', annual_entitlement: 15, cap: null, is_system: true },
    { code: 'pto', name: 'Personal Time Off', annual_entitlement: 7, cap: null, is_system: true },
    { code: 'lwop', name: 'Leave Without Pay', annual_entitlement: 0, cap: null, is_system: true },
  ];

  const sidebarLeaveItems = useMemo(() => {
    const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : defaultTypes;
    const filtered = isRegular ? types : types.filter((t) => t.code === 'lwop');
    return filtered.map((t) => ({
      value: t.code,
      label: t.name,
      description: `${t.name} requests`,
      icon: ICON_BY_CODE[t.code] || DEFAULT_ICON,
    }));
  }, [isRegular, eligibleLeaveTypes]);

  const fileLeaveOptions = useMemo(() => {
    const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : defaultTypes;
    return isRegular ? types : types.filter((t) => t.code === 'lwop');
  }, [isRegular, eligibleLeaveTypes]);

  const approvalSidebarItems = useMemo(() => {
    const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : defaultTypes;
    return types.map((t) => ({
      value: t.code,
      label: t.name,
      description: `${t.name} requests`,
      icon: ICON_BY_CODE[t.code] || DEFAULT_ICON,
    }));
  }, [eligibleLeaveTypes]);

  useEffect(() => {
    if (!isRegular && !['lwop', ''].includes(selectedLeaveType)) {
      setSelectedLeaveType('lwop');
    }
  }, [isRegular, selectedLeaveType]);

  useEffect(() => {
    if (sidebarLeaveItems.length > 0 && selectedLeaveType === '') {
      setSelectedLeaveType(sidebarLeaveItems[0].value);
    }
  }, [sidebarLeaveItems, selectedLeaveType]);

  useEffect(() => {
    setLeavePage(1);
  }, [selectedLeaveType]);

  useEffect(() => {
    if (mainTab === 'approval' && approvalSidebarItems.length > 0 && selectedApprovalLeaveType === '') {
      setSelectedApprovalLeaveType(approvalSidebarItems[0].value);
    }
  }, [mainTab, approvalSidebarItems, selectedApprovalLeaveType]);

  const paginatedMyRequests = useMemo(() => {
    const start = (leavePage - 1) * PAGE_SIZE;
    return filteredMyRequests.slice(start, start + PAGE_SIZE);
  }, [filteredMyRequests, leavePage]);

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
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
    if (leaveType === 'vl') {
      const minDate = getMinDateForVL();
      if (form.start_date < minDate) {
        toast.error('Vacation Leave must be filed at least 7 days before the leave date');
        return;
      }
    }
    if (leaveType === 'sl') {
      const today = new Date().toISOString().slice(0, 10);
      if (form.start_date === today && !slAttachmentFile) {
        const shiftStart = shiftForSLDate?.start_time ?? '08:00:00';
        if (isPastSLDeadline(shiftStart)) {
          const deadline = getSLDeadlineFormatted(shiftStart);
          toast.error(`Sick Leave must be filed at least 2 hours before your shift start (by ${deadline}). Add an attachment (e.g. medical certificate) to bypass this rule.`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;
      if (leaveType === 'sl' && slAttachmentFile) {
        const ext = slAttachmentFile.name.split('.').pop() || 'pdf';
        const path = `${currentUser.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('sl-attachments').upload(path, slAttachmentFile, { upsert: false });
        if (uploadErr) {
          toast.error('Failed to upload attachment. Try again.');
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('sl-attachments').getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }
      const { data, error } = await supabase.rpc('validate_and_submit_leave', {
        p_leave_type: leaveType,
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_leave_duration_type: form.leave_duration_type,
        p_reason: form.reason || null,
        p_attachment_url: attachmentUrl,
      });
      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Leave request submitted successfully');
        if (result.id) {
          sendRequestNotification({ event: 'submitted', requestType: 'leave', requestId: result.id }).catch(() => {});
          createRequestInAppNotification({ event: 'submitted', requestType: 'leave', requestId: result.id }).catch(() => {});
        }
        setFileDialogOpen(false);
        setForm({ leave_type: fileLeaveOptions[0]?.code ?? 'lwop', start_date: '', end_date: '', leave_duration_type: 'fullday', reason: '' });
        setSlAttachmentFile(null);
        fetchAll();
      } else {
        toast.error(result?.error || 'Failed to submit leave request');
      }
    } catch {
      toast.error('Failed to submit leave request');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  if (loading && !balance && myRequests.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const year = new Date().getFullYear();
  const canApprove = currentUser?.roles?.some((r) =>
    ['super_admin', 'admin', 'supervisor', 'manager'].includes(r)
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">{mainTab === 'approval' ? 'Leave Approvals' : 'Leave Management'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {mainTab === 'approval'
            ? 'Review and approve leave requests from your team members'
            : 'View balances, file leave requests, and approve team requests'}
        </p>
      </div>

    <div className="flex gap-6 flex-1 min-h-0 mt-4">
      {/* Sidebar - Leave types (Leave) or Approval types (Approval) */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 min-h-0 overflow-y-auto pr-1">
        <div className="flex items-center gap-3 px-4 py-4 mb-2 rounded-xl bg-primary/5 border border-primary/10">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">
              {mainTab === 'approval' ? 'Leave Approvals' : 'Leave Management'}
            </p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">Filter by leave type</p>
          </div>
        </div>

        {/* Leave | Approval tabs - Master Data style */}
        {canApprove && (
          <div className="flex rounded-lg bg-muted p-0.5 mb-3">
            <button
              onClick={() => setMainTab('leave')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'leave'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Leave
            </button>
            <button
              onClick={() => setMainTab('approval')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'approval'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Approval
            </button>
          </div>
        )}

        {/* Leave tab: balance + leave type nav | Approval tab: leave type nav for approvals */}
        {mainTab === 'approval' ? (
        <nav className="flex flex-col gap-0.5">
          {approvalSidebarItems.map((item) => {
            const Icon = item.icon;
            const active = selectedApprovalLeaveType === item.value;
            return (
              <button
                key={item.value}
                onClick={() => setSelectedApprovalLeaveType(item.value)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group w-full relative',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-colors',
                    active ? 'bg-primary/15' : 'bg-muted group-hover:bg-muted/80'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{item.description}</p>
                </div>
                <ChevronRight className={cn('h-4 w-4 shrink-0 transition-opacity', active ? 'opacity-60' : 'opacity-0 group-hover:opacity-30')} />
              </button>
            );
          })}
        </nav>
        ) : (
        <nav className="flex flex-col gap-0.5">
          {sidebarLeaveItems.map((item) => {
            const Icon = item.icon;
            const active = selectedLeaveType === item.value;
            return (
              <button
                key={item.value}
                onClick={() => setSelectedLeaveType(item.value)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group w-full relative',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-md flex items-center justify-center shrink-0 transition-colors',
                    active ? 'bg-primary/15' : 'bg-muted group-hover:bg-muted/80'
                  )}
                >
                  <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{item.description}</p>
                </div>
                <ChevronRight className={cn('h-4 w-4 shrink-0 transition-opacity', active ? 'opacity-60' : 'opacity-0 group-hover:opacity-30')} />
              </button>
            );
          })}
        </nav>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Mobile: Leave | Approval tabs when sidebar hidden */}
        {canApprove && (
          <div className="lg:hidden flex rounded-lg bg-muted p-0.5 shrink-0">
            <button
              onClick={() => setMainTab('leave')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'leave'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Leave
            </button>
            <button
              onClick={() => setMainTab('approval')}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'approval'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Approval
            </button>
          </div>
        )}
        {mainTab === 'approval' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LeaveApprovals
              embedded
              filterCode={selectedApprovalLeaveType}
              onFilterChange={setSelectedApprovalLeaveType}
            />
          </div>
        ) : (
        <div className="flex flex-col flex-1 min-h-0">
        {/* Leave balances row - horizontal scroll, above leave requests table */}
        <div className="shrink-0 overflow-x-auto pb-1 -mx-1 scroll-smooth snap-x snap-mandatory">
          <div className="flex gap-3 min-w-max">
            {!isRegular ? (
              <div className="shrink-0 rounded-lg border border-l-4 border-l-slate-400 bg-card px-4 py-3 flex flex-col gap-0.5 min-w-[100px] snap-start">
                <div className="flex items-center gap-1.5">
                  <CalendarX className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">LWOP used</span>
                </div>
                <span className="text-xl font-bold tabular-nums">{balance?.lwop_days_used ?? 0}</span>
              </div>
            ) : loading ? (
              <div className="shrink-0 rounded-lg border bg-muted/50 px-4 py-3 min-w-[100px] snap-start">
                <span className="text-xs text-muted-foreground">Loading...</span>
              </div>
            ) : balance && fileLeaveOptions.filter((t) => t.code !== 'lwop').length > 0 ? (
              <>
                {fileLeaveOptions.filter((t) => t.code !== 'lwop').map((cfg) => {
                  const val = getBalanceForType(balance, cfg);
                  const label = ['vl', 'sl', 'pto'].includes(cfg.code) ? cfg.code.toUpperCase() : cfg.name;
                  const maxVal = cfg.cap ?? cfg.annual_entitlement;
                  const Icon = ICON_BY_CODE[cfg.code] || DEFAULT_ICON;
                  const borderCls = BORDER_BY_CODE[cfg.code] || 'border-l-slate-400';
                  const isLow = cfg.code !== 'lwop' && val <= 3;
                  return (
                    <div
                      key={cfg.code}
                      className={cn(
                        'shrink-0 rounded-lg border border-l-4 bg-card px-4 py-3 flex flex-col gap-0.5 min-w-[100px] hover:bg-muted/30 transition-colors snap-start',
                        borderCls,
                        isLow && 'ring-1 ring-amber-200'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate max-w-[90px]">{label}</span>
                      </div>
                      <span className="text-xl font-bold tabular-nums">{val}</span>
                      {maxVal != null && cfg.code !== 'lwop' && (
                        <span className="text-[11px] text-muted-foreground">of {maxVal} days</span>
                      )}
                    </div>
                  );
                })}
                {fileLeaveOptions.some((t) => t.code === 'lwop') && (
                  <div className="shrink-0 rounded-lg border border-l-4 border-l-slate-400 bg-card px-4 py-3 flex flex-col gap-0.5 min-w-[100px] snap-start">
                    <div className="flex items-center gap-1.5">
                      <CalendarX className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">LWOP used</span>
                    </div>
                    <span className="text-xl font-bold tabular-nums">{balance?.lwop_days_used ?? 0}</span>
                  </div>
                )}
                <Link
                  to="/dashboard/leave-balance"
                  className="shrink-0 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:bg-primary/5 hover:border-primary/30 transition-colors min-w-[100px] snap-start"
                >
                  View full balance <ChevronRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <Link
                to="/dashboard/leave-balance"
                className="shrink-0 rounded-lg border border-dashed border-muted-foreground/30 px-4 py-3 flex items-center gap-1 text-xs font-medium text-primary hover:bg-primary/5 hover:border-primary/30 transition-colors min-w-[100px] snap-start"
              >
                View full balance <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Mobile: leave type filter */}
        <div className="lg:hidden shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1">
          {sidebarLeaveItems.map((item) => {
            const Icon = item.icon;
            const active = selectedLeaveType === item.value;
            return (
              <button
                key={item.value}
                onClick={() => setSelectedLeaveType(item.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">My Leave Requests</CardTitle>
              <Button
                onClick={() => {
                  const opts = fileLeaveOptions;
                  const fromTab = selectedLeaveType && opts.some((t) => t.code === selectedLeaveType);
                  const leaveType = opts.length > 0
                    ? (fromTab ? selectedLeaveType : opts[0].code)
                    : 'lwop';
                  setForm({
                    leave_type: leaveType,
                    start_date: '',
                    end_date: '',
                    leave_duration_type: 'fullday',
                    reason: '',
                  });
                  setSlAttachmentFile(null);
                  setFileDialogOpen(true);
                }}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                File Leave
              </Button>
            </CardHeader>
            <CardContent>
              {filteredMyRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  {selectedLeaveType ? `No ${sidebarLeaveItems.find((i) => i.value === selectedLeaveType)?.label} requests yet` : 'No leave requests yet'}
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approved/Rejected by</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="w-[80px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedMyRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium uppercase">{r.leave_type}</TableCell>
                        <TableCell>
                          {formatDate(r.start_date)} – {formatDate(r.end_date)}
                        </TableCell>
                        <TableCell>{r.number_of_days ?? '—'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              r.status === 'approved'
                                ? 'bg-green-100 text-green-700 border-green-200'
                                : r.status === 'rejected'
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                          {(r.status === 'approved' || r.status === 'rejected') && r.approver_name ? r.approver_name : '—'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => setViewingRequest(r)}
                          >
                            <Eye className="h-4 w-4 mr-1.5" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    totalItems={filteredMyRequests.length}
                    currentPage={leavePage}
                    onPageChange={setLeavePage}
                    pageSize={PAGE_SIZE}
                    className="pt-2"
                  />
                </>
              )}
            </CardContent>
          </Card>

          </div>
        </div>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>File Leave Request</DialogTitle>
            <DialogDescription>
              {isRegular
                ? 'Submit a new leave request. VL requires 7 days notice. SL requires 2 hours before shift.'
                : 'As a non-regular employee, you can file Leave Without Pay (LWOP) only.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                const types = eligibleLeaveTypes.length > 0 ? eligibleLeaveTypes : defaultTypes;
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
                    Balance: <strong>{remaining}</strong> of {total} days remaining
                  </p>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  min={form.leave_type === 'vl' ? getMinDateForVL() : undefined}
                />
                {form.leave_type === 'vl' && (
                  <p className="text-xs text-muted-foreground">VL must be filed at least 7 days before the leave date</p>
                )}
                {form.leave_type === 'sl' && form.start_date && (() => {
                  const today = new Date().toISOString().slice(0, 10);
                  if (form.start_date !== today) return null;
                  const shiftStart = shiftForSLDate?.start_time ?? '08:00:00';
                  const deadline = getSLDeadlineFormatted(shiftStart);
                  const isLate = isPastSLDeadline(shiftStart) && !slAttachmentFile;
                  return (
                    <p className={cn('text-xs', isLate ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                      SL must be filed at least 2 hours before your shift start (by {deadline})
                      {slAttachmentFile && ' — attachment bypasses this rule'}
                      {isLate && !slAttachmentFile && ' — deadline passed'}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  min={form.start_date || undefined}
                />
              </div>
            </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={form.leave_duration_type} onValueChange={(v) => setForm((f) => ({ ...f, leave_duration_type: v as typeof form.leave_duration_type }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.start_date && form.end_date && (() => {
              const days = countDaysExcludingSunday(form.start_date, form.end_date, form.leave_duration_type) ?? 0;
              const leaveType: string = !isRegular ? 'lwop' : form.leave_type;
              const currentBal =
                balance && leaveType !== 'lwop'
                  ? leaveType === 'vl'
                    ? balance.vl_balance
                    : leaveType === 'sl'
                      ? balance.sl_balance
                      : leaveType === 'pto'
                        ? balance.pto_balance
                        : balance.balances?.[leaveType]
                  : null;
              const afterBal = currentBal != null ? Math.max(0, Number(currentBal) - days) : null;
              const cfg = fileLeaveOptions.find((c) => c.code === leaveType);
              const balanceLabel = cfg ? (['vl', 'sl', 'pto', 'lwop'].includes(leaveType) ? leaveType.toUpperCase() : cfg.name) : leaveType;
              return (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>
                    Number of days: <strong>{days}</strong>{' '}
                    <span className="text-xs">(Sundays excluded)</span>
                  </p>
                  {leaveType !== 'lwop' && currentBal != null && afterBal != null && (
                    <p className="text-xs">
                      {days} day{days !== 1 ? 's' : ''} will be deducted from {balanceLabel} when approved by supervisor/admin ({currentBal} → {afterBal})
                    </p>
                  )}
                  {leaveType === 'lwop' && (
                    <p className="text-xs">LWOP is unpaid leave; no balance deduction.</p>
                  )}
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Reason for leave"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={3}
                required
              />
            </div>
            {form.leave_type === 'sl' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attachment (optional)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setSlAttachmentFile(e.target.files?.[0] ?? null)}
                    className="text-sm"
                  />
                  {slAttachmentFile && (
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{slAttachmentFile.name}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Add a medical certificate or supporting document. For same-day SL, attachments bypass the 2-hour-before-shift rule.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setConfirmSubmitOpen(true)} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSubmitOpen} onOpenChange={(open) => setConfirmSubmitOpen(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Leave Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to confirm this leave? Once submitted, it will be routed for approval based on your
              company&apos;s rules.
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
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Yes, confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>
              {viewingRequest && `${viewingRequest.leave_type.toUpperCase()} • ${viewingRequest.status}`}
            </DialogDescription>
          </DialogHeader>
          {viewingRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Leave Type</p>
                  <p className="font-medium uppercase">{viewingRequest.leave_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      viewingRequest.status === 'approved' && 'bg-green-100 text-green-700 border-green-200',
                      viewingRequest.status === 'rejected' && 'bg-red-100 text-red-700 border-red-200',
                      viewingRequest.status === 'pending' && 'bg-yellow-100 text-yellow-700 border-yellow-200'
                    )}
                  >
                    {viewingRequest.status}
                  </Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {formatDate(viewingRequest.start_date)} – {formatDate(viewingRequest.end_date)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {DURATION_TYPES.find((d) => d.value === viewingRequest.leave_duration_type)?.label ?? 'Full Day'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Days</p>
                  <p className="font-medium">{viewingRequest.number_of_days ?? '—'}</p>
                </div>
                {viewingRequest.reason && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Reason</p>
                    <p className="font-medium mt-0.5">{viewingRequest.reason}</p>
                  </div>
                )}
                {viewingRequest.attachment_url && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Attachment</p>
                    <a
                      href={viewingRequest.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1.5 mt-0.5"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      View attachment
                    </a>
                  </div>
                )}
                {(viewingRequest.status === 'approved' || viewingRequest.status === 'rejected') && viewingRequest.approver_name && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">{viewingRequest.status === 'approved' ? 'Approved' : 'Rejected'} by</p>
                    <p className="font-medium mt-0.5">{viewingRequest.approver_name}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingRequest(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
        )}
      </div>
    </div>
    </div>
  );
};

export default Leave;
