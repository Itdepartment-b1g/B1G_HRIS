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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { cn } from '@/lib/utils';
import { Loader2, Plus, Timer, Eye, Paperclip, CalendarDays } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { getWeekdayForDate } from '@/lib/attendanceStatus';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import type { OvertimeRequest } from '@/types';
import OvertimeApprovals from './OvertimeApprovals';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Local date string YYYY-MM-DD for DayPicker (avoids timezone shifts) */
function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(timeStr: string) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Parse "19:00:00" to minutes from midnight */
function parseTimeToMinutes(timeStr: string): number {
  const parts = (timeStr || '00:00').toString().split(':').map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

/** Compute OT: (time_out_mins - shift_end_mins), round down to 30, return hours. Min 1hr to qualify. */
function computeOTHours(timeOutStr: string, shiftEndStr: string): { valid: boolean; hours: number } {
  const timeOutMins = parseTimeToMinutes(timeOutStr);
  const shiftEndMins = parseTimeToMinutes(shiftEndStr);
  const rawMins = timeOutMins - shiftEndMins;
  if (rawMins < 30) return { valid: false, hours: 0 };
  const roundedMins = Math.floor(rawMins / 30) * 30;
  if (roundedMins < 60) return { valid: false, hours: 0 };
  return { valid: true, hours: roundedMins / 60 };
}

const Overtime = () => {
  const { user: currentUser } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [mainTab, setMainTab] = useState<'overtime' | 'approval'>(() =>
    tabParam === 'approval' ? 'approval' : 'overtime'
  );
  useEffect(() => {
    if (tabParam === 'approval') setMainTab('approval');
  }, [tabParam]);
  const [myRequests, setMyRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<OvertimeRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otPage, setOtPage] = useState(1);
  const [otAttachmentFile, setOtAttachmentFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    ot_date: '',
    reason: '',
  });

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

  const isEligible = useMemo(() => {
    if (!currentUser?.roles?.length) return false;
    return (
      !currentUser.roles.includes('manager') &&
      !currentUser.roles.includes('executive')
    );
  }, [currentUser?.roles]);

  const fetchMyRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('overtime_requests')
      .select('*, approver:employees!approved_by(first_name, last_name)')
      .eq('employee_id', currentUser.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    const withApprover = (data || []).map((r: any) => ({
      ...r,
      approver_name: r.approver
        ? `${r.approver.first_name} ${r.approver.last_name}`
        : null,
    }));
    setMyRequests(withApprover as OvertimeRequest[]);
  }, [currentUser?.id]);

  const fetchOtPreview = useCallback(
    async (dateStr: string) => {
      if (!currentUser?.id || !dateStr) {
        setOtPreview({ loading: false, valid: false });
        return;
      }
      setOtPreview((p) => ({ ...p, loading: true }));
      const weekday = getWeekdayForDate(dateStr);

      const [attRes, shiftRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('time_in, time_out, status')
          .eq('employee_id', currentUser.id)
          .eq('date', dateStr)
          .maybeSingle(),
        supabase
          .from('employee_shifts')
          .select('shift:shifts(end_time, days)')
          .eq('employee_id', currentUser.id),
      ]);

      const att = attRes.data;
      const shifts = (shiftRes.data || [])
        .map((s: any) => s.shift)
        .filter(Boolean);
      const shiftForDay = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
      const shiftEnd = shiftForDay?.end_time ?? '19:00:00';

      if (!att?.time_in) {
        setOtPreview({
          loading: false,
          valid: false,
          error: 'No attendance record for this date',
        });
        return;
      }
      if (att.status === 'absent') {
        setOtPreview({
          loading: false,
          valid: false,
          error: 'Cannot file OT when absent',
        });
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

      const timeOutRaw = att.time_out;
      const timeOutStr =
        typeof timeOutRaw === 'string' && timeOutRaw.length <= 10
          ? timeOutRaw
          : (() => {
              const d = new Date(timeOutRaw as string);
              const h = d.getHours();
              const m = d.getMinutes();
              const s = d.getSeconds();
              return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            })();
      const { valid, hours } = computeOTHours(timeOutStr, shiftEnd);

      setOtPreview({
        loading: false,
        valid,
        hours,
        shiftEnd,
        timeOut: timeOutStr,
        error: valid ? undefined : 'Minimum overtime is 1 hour',
      });
    },
    [currentUser?.id]
  );

  const fetchEligibleDates = useCallback(async () => {
    if (!currentUser?.id) return;
    setEligibleDatesLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [attRes, shiftRes, existingRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('date, time_in, time_out, status')
          .eq('employee_id', currentUser.id)
          .gte('date', sixtyDaysAgo)
          .lte('date', today)
          .not('time_out', 'is', null),
        supabase
          .from('employee_shifts')
          .select('shift:shifts(end_time, days)')
          .eq('employee_id', currentUser.id),
        supabase
          .from('overtime_requests')
          .select('date')
          .eq('employee_id', currentUser.id),
      ]);

      const shifts = (shiftRes.data || []).map((s: any) => s.shift).filter(Boolean);
      const existingDates = new Set((existingRes.data || []).map((r: { date: string }) => r.date));

      const eligible: { date: string; hours: number }[] = [];
      for (const att of attRes.data || []) {
        if (att.status === 'absent' || existingDates.has(att.date)) continue;
        const weekday = getWeekdayForDate(att.date);
        const shiftForDay = shifts.find((s: any) => !s.days?.length || s.days.includes(weekday)) || shifts[0];
        const shiftEnd = shiftForDay?.end_time ?? '19:00:00';
        const timeOutRaw = att.time_out;
        const timeOutStr =
          typeof timeOutRaw === 'string' && timeOutRaw.length <= 10
            ? timeOutRaw
            : (() => {
                const d = new Date(timeOutRaw as string);
                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
              })();
        const { valid, hours } = computeOTHours(timeOutStr, shiftEnd);
        if (valid && hours >= 1) eligible.push({ date: att.date, hours });
      }
      eligible.sort((a, b) => b.date.localeCompare(a.date));
      setEligibleDates(eligible);
    } catch {
      setEligibleDates([]);
    } finally {
      setEligibleDatesLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    setLoading(true);
    fetchMyRequests().finally(() => setLoading(false));
  }, [currentUser?.id, fetchMyRequests]);

  useEffect(() => {
    if (form.ot_date) {
      fetchOtPreview(form.ot_date);
    } else {
      setOtPreview({ loading: false, valid: false });
    }
  }, [form.ot_date, fetchOtPreview]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('overtime-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'overtime_requests',
          filter: `employee_id=eq.${currentUser.id}`,
        },
        () => fetchMyRequests()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchMyRequests]);

  const paginatedRequests = useMemo(() => {
    const start = (otPage - 1) * PAGE_SIZE;
    return myRequests.slice(start, start + PAGE_SIZE);
  }, [myRequests, otPage]);

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

      const { data } = await supabase.rpc('validate_and_submit_overtime', {
        p_ot_date: form.ot_date,
        p_reason: form.reason.trim(),
        p_attachment_url: attachmentUrl,
      });

      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Overtime request submitted successfully');
        if (result.id) {
          sendRequestNotification({ event: 'submitted', requestType: 'overtime', requestId: result.id }).catch(() => {});
        }
        setFileDialogOpen(false);
        setForm({ ot_date: '', reason: '' });
        setOtAttachmentFile(null);
        fetchMyRequests();
      } else {
        toast.error(result?.error || 'Failed to submit overtime request');
      }
    } catch {
      toast.error('Failed to submit overtime request');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  if (loading && myRequests.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canApprove = currentUser?.roles?.some((r) =>
    ['super_admin', 'admin', 'supervisor', 'manager'].includes(r)
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{mainTab === 'approval' ? 'Overtime Approvals' : 'Overtime Management'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {mainTab === 'approval'
            ? 'Review and approve overtime requests from your team members'
            : 'File overtime requests and approve team requests'}
        </p>
      </div>

    <div className="flex gap-6 min-h-[calc(100vh-120px)]">
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
        <div className="flex items-center gap-3 px-4 py-4 mb-2 rounded-xl bg-primary/5 border border-primary/10">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Timer className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-tight">
              {mainTab === 'approval' ? 'Overtime Approvals' : 'Overtime Management'}
            </p>
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">
              {mainTab === 'approval' ? 'Filter by status' : 'My overtime requests'}
            </p>
          </div>
        </div>

        {/* Overtime | Approval tabs - Master Data style */}
        {canApprove && (
          <div className="flex rounded-lg bg-muted p-0.5 mb-3">
            <button
              onClick={() => { setMainTab('overtime'); setSearchParams({}); }}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'overtime'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Overtime
            </button>
            <button
              onClick={() => { setMainTab('approval'); setSearchParams({ tab: 'approval' }); }}
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
          <div className="text-sm text-muted-foreground py-4">
            <p>All overtime requests for approval in one place.</p>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">
            <p>File overtime requests and track approval status.</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Mobile: Overtime | Approval tabs */}
        {canApprove && (
          <div className="lg:hidden flex rounded-lg bg-muted p-0.5">
            <button
              onClick={() => { setMainTab('overtime'); setSearchParams({}); }}
              className={cn(
                'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                mainTab === 'overtime'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Overtime
            </button>
            <button
              onClick={() => { setMainTab('approval'); setSearchParams({ tab: 'approval' }); }}
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
        <OvertimeApprovals embedded />
      ) : (
      <>
      {!isEligible && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-800">
              Managers and executives are not eligible to file overtime.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">My Overtime Requests</CardTitle>
          {isEligible && (
            <Button
              onClick={() => {
                setForm({ ot_date: '', reason: '' });
                setOtAttachmentFile(null);
                setFileDialogOpen(true);
                fetchEligibleDates();
              }}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              File OT
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No overtime requests yet
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Start – End</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approved/Rejected by</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{formatDate(r.date)}</TableCell>
                      <TableCell>{r.hours ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        {formatTime(r.start_time)} – {formatTime(r.end_time)}
                      </TableCell>
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
                        {(r.status === 'approved' || r.status === 'rejected') && r.approver_name
                          ? r.approver_name
                          : '—'}
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
                totalItems={myRequests.length}
                currentPage={otPage}
                onPageChange={setOtPage}
                pageSize={PAGE_SIZE}
                className="pt-2"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>File Overtime Request</DialogTitle>
            <DialogDescription>
              Only dates with at least 1 hour overtime (time-out after shift end) are shown. OT is computed from your recorded time-out vs your shift end time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>OT Date</Label>
              {eligibleDatesLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading dates with 1hr+ overtime…
                </div>
              ) : eligibleDates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No dates with 1hr+ overtime in the last 60 days. OT is only available when time-out is at least 1 hour after your shift end.
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
                        fromDate={new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)}
                        toDate={new Date()}
                      />
                    </PopoverContent>
                  </Popover>
                  {form.ot_date && otPreview.valid && (
                    <p className="text-xs text-green-600">
                      Eligible: {otPreview.hours} hr(s)
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Reason (required)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Project deadline, urgent task"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Attachment (optional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setOtAttachmentFile(e.target.files?.[0] ?? null)}
                />
                {otAttachmentFile && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {otAttachmentFile.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !otPreview.valid || !form.reason?.trim()}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Overtime Request Details</DialogTitle>
            <DialogDescription>
              {viewingRequest &&
                `${formatDate(viewingRequest.date)} • ${viewingRequest.hours} hr(s) • ${viewingRequest.status}`}
            </DialogDescription>
          </DialogHeader>
          {viewingRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewingRequest.date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hours</p>
                  <p className="font-medium">{viewingRequest.hours ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Time</p>
                  <p className="font-medium">
                    {formatTime(viewingRequest.start_time)} – {formatTime(viewingRequest.end_time)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge
                    variant="outline"
                    className={
                      viewingRequest.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : viewingRequest.status === 'rejected'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                    }
                  >
                    {viewingRequest.status}
                  </Badge>
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
                {(viewingRequest.status === 'approved' || viewingRequest.status === 'rejected') &&
                  viewingRequest.approver_name && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">
                        {viewingRequest.status === 'approved' ? 'Approved' : 'Rejected'} by
                      </p>
                      <p className="font-medium mt-0.5">{viewingRequest.approver_name}</p>
                    </div>
                  )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setViewingRequest(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}
      </div>
    </div>
    </div>
  );
};

export default Overtime;
