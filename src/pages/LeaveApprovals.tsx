import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Check, X, Calendar, Clock, Palmtree, HeartPulse, Briefcase, CalendarX, ChevronRight, Eye, Paperclip, Baby } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RequireRole } from '@/components/RequireRole';
import { cn } from '@/lib/utils';
import type { LeaveRequest, LeaveTypeConfigForBalance } from '@/types';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface LeaveRequestWithEmployee extends LeaveRequest {
  employee_name: string;
  approver_name?: string | null;
}

const DURATION_LABELS: Record<string, string> = {
  fullday: 'Full Day',
  first_half: 'First Half',
  second_half: 'Second Half',
};

const ICON_BY_CODE: Record<string, React.ComponentType<{ className?: string }>> = {
  vl: Palmtree,
  sl: HeartPulse,
  pto: Briefcase,
  lwop: CalendarX,
  maternity: Baby,
  paternity: Baby,
};
const DEFAULT_ICON = Calendar;

const defaultTypes: LeaveTypeConfigForBalance[] = [
  { code: 'vl', name: 'Vacation Leave', annual_entitlement: 15, cap: 30, is_system: true },
  { code: 'sl', name: 'Sick Leave', annual_entitlement: 15, cap: null, is_system: true },
  { code: 'pto', name: 'Personal Time Off', annual_entitlement: 7, cap: null, is_system: true },
  { code: 'lwop', name: 'Leave Without Pay', annual_entitlement: 0, cap: null, is_system: true },
];

const LeaveApprovals = () => {
  const { user: currentUser } = useCurrentUser();
  const [pending, setPending] = useState<LeaveRequestWithEmployee[]>([]);
  const [approved, setApproved] = useState<LeaveRequestWithEmployee[]>([]);
  const [rejected, setRejected] = useState<LeaveRequestWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('');
  const [viewingRequest, setViewingRequest] = useState<LeaveRequestWithEmployee | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeConfigForBalance[]>([]);

  const sidebarLeaveItems = useMemo(() => {
    const types = leaveTypes.length > 0 ? leaveTypes : defaultTypes;
    return types.map((t) => ({
      value: t.code,
      label: t.name,
      description: `${t.name} requests`,
      icon: ICON_BY_CODE[t.code] || DEFAULT_ICON,
    }));
  }, [leaveTypes]);

  const fetchSupervisedIds = useCallback(async (): Promise<string[]> => {
    if (!currentUser?.id) return [];
    const supervisedIds = new Set<string>();
    const { data: esData } = await supabase
      .from('employee_supervisors')
      .select('employee_id')
      .eq('supervisor_id', currentUser.id);
    (esData || []).forEach((r) => supervisedIds.add(r.employee_id));
    const { data: empData } = await supabase
      .from('employees')
      .select('id')
      .eq('supervisor_id', currentUser.id)
      .eq('is_active', true);
    (empData || []).forEach((r) => supervisedIds.add(r.id));
    if (currentUser.roles?.includes('super_admin') || currentUser.roles?.includes('admin')) {
      const { data: allEmps } = await supabase.from('employees').select('id').eq('is_active', true);
      (allEmps || []).forEach((r) => supervisedIds.add(r.id));
    }
    return Array.from(supervisedIds);
  }, [currentUser?.id, currentUser?.roles]);

  const fetchLeaveTypes = useCallback(async () => {
    const { data } = await supabase
      .from('leave_type_config')
      .select('code, name, annual_entitlement, cap, is_system')
      .order('sort_order');
    const configs = (data || []) as LeaveTypeConfigForBalance[];
    setLeaveTypes(configs.length > 0 ? configs : []);
  }, []);

  const fetchRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    const ids = await fetchSupervisedIds();
    if (ids.length === 0) {
      setPending([]);
      setApproved([]);
      setRejected([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('leave_requests')
      .select('*, employee:employees!employee_id(first_name, last_name), approver:employees!approved_by(first_name, last_name)')
      .in('employee_id', ids)
      .order('created_at', { ascending: false });
    const withName = (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown',
      approver_name: r.approver ? `${r.approver.first_name} ${r.approver.last_name}` : null,
    }));
    setPending(withName.filter((r) => r.status === 'pending'));
    setApproved(withName.filter((r) => r.status === 'approved'));
    setRejected(withName.filter((r) => r.status === 'rejected'));
    setLoading(false);
  }, [currentUser?.id, fetchSupervisedIds]);

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (sidebarLeaveItems.length > 0 && selectedLeaveType === '') {
      setSelectedLeaveType(sidebarLeaveItems[0].value);
    }
  }, [sidebarLeaveItems, selectedLeaveType]);

  const filterByType = (list: LeaveRequestWithEmployee[]) =>
    !selectedLeaveType ? list : list.filter((r) => (r.leave_type || '').toLowerCase() === selectedLeaveType.toLowerCase());

  const filteredPending = useMemo(() => filterByType(pending), [pending, selectedLeaveType]);
  const filteredApproved = useMemo(() => filterByType(approved), [approved, selectedLeaveType]);
  const filteredRejected = useMemo(() => filterByType(rejected), [rejected, selectedLeaveType]);

  const handleApprove = async (id: string, action: 'approved' | 'rejected') => {
    setApproving(id);
    try {
      const { data } = await supabase.rpc('approve_leave_request', { p_leave_id: id, p_action: action });
      const result = data as { success: boolean; error?: string };
      if (result?.success) {
        toast.success(action === 'approved' ? 'Leave approved' : 'Leave rejected');
        fetchRequests();
      } else {
        toast.error(result?.error || 'Action failed');
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setApproving(null);
    }
  };

  if (!currentUser) return null;

  const statusBadgeClass = (status: string) =>
    status === 'approved'
      ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800'
      : status === 'rejected'
        ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800'
        : 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-400 dark:border-yellow-800';

  const renderRequests = (requests: LeaveRequestWithEmployee[], showActions: boolean) => {
    if (requests.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No requests</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {requests.map((r) => (
          <Card
            key={r.id}
            className={cn(
              'transition-colors',
              showActions && 'hover:border-primary/30'
            )}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {r.employee_name.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.employee_name}
                      <span className="uppercase text-muted-foreground font-medium">— {r.leave_type}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      {r.number_of_days != null && (
                        <span> • {r.number_of_days} day{r.number_of_days !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                    {r.reason && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.reason}</p>
                    )}
                    {r.attachment_url && (
                      <a
                        href={r.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 mt-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Paperclip className="h-3 w-3" />
                        Attachment
                      </a>
                    )}
                    {(r.status === 'approved' || r.status === 'rejected') && r.approver_name && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {r.status === 'approved' ? 'Approved' : 'Rejected'} by {r.approver_name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setViewingRequest(r)}
                  >
                    <Eye className="h-4 w-4 mr-1.5" />
                    View
                  </Button>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
                      statusBadgeClass(r.status)
                    )}
                  >
                    {r.status}
                  </span>
                  {showActions && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 w-8 p-0"
                        onClick={() => handleApprove(r.id, 'approved')}
                        disabled={approving === r.id}
                        title="Approve"
                      >
                        {approving === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 w-8 p-0"
                        onClick={() => handleApprove(r.id, 'rejected')}
                        disabled={approving === r.id}
                        title="Reject"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <RequireRole roles={['super_admin', 'admin', 'supervisor', 'manager']}>
      <div className="flex gap-6 min-h-[calc(100vh-120px)]">
        {/* Sidebar - Leave types */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 max-h-[calc(100vh-120px)] overflow-y-auto pr-1">
          <div className="flex items-center gap-3 px-4 py-4 mb-2 rounded-xl bg-primary/5 border border-primary/10">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm leading-tight">Leave Approvals</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Filter by leave type</p>
            </div>
          </div>
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
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Leave Approvals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review and approve leave requests from your team members
            </p>
          </div>

          {/* Mobile: leave type filter */}
          <div className="lg:hidden flex gap-2 overflow-x-auto pb-1 -mx-1">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leave Requests</CardTitle>
              <CardDescription>
                {selectedLeaveType
                  ? `Showing ${sidebarLeaveItems.find((i) => i.value === selectedLeaveType)?.label || selectedLeaveType.toUpperCase()} requests.`
                  : 'Pending requests require your approval. Approved and rejected requests are shown for reference.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Tabs defaultValue="pending" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pending">
                      Pending ({filteredPending.length})
                    </TabsTrigger>
                    <TabsTrigger value="approved">Approved ({filteredApproved.length})</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected ({filteredRejected.length})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="pending" className="mt-5">
                    {renderRequests(filteredPending, true)}
                  </TabsContent>
                  <TabsContent value="approved" className="mt-5">
                    {renderRequests(filteredApproved, false)}
                  </TabsContent>
                  <TabsContent value="rejected" className="mt-5">
                    {renderRequests(filteredRejected, false)}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>
              {viewingRequest && `${viewingRequest.employee_name} • ${viewingRequest.leave_type.toUpperCase()} • ${viewingRequest.status}`}
            </DialogDescription>
          </DialogHeader>
          {viewingRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Employee</p>
                  <p className="font-medium">{viewingRequest.employee_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Leave Type</p>
                  <p className="font-medium uppercase">{viewingRequest.leave_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
                      statusBadgeClass(viewingRequest.status)
                    )}
                  >
                    {viewingRequest.status}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Dates</p>
                  <p className="font-medium">
                    {formatDate(viewingRequest.start_date)} – {formatDate(viewingRequest.end_date)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="font-medium">
                    {DURATION_LABELS[viewingRequest.leave_duration_type || 'fullday'] ?? 'Full Day'}
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
    </RequireRole>
  );
};

export default LeaveApprovals;
