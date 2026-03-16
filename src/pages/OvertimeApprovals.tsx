import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Check, X, Calendar, Clock, Eye, Paperclip, Timer } from 'lucide-react';
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
import type { OvertimeRequest } from '@/types';

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeStr: string) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

interface OvertimeRequestWithEmployee extends OvertimeRequest {
  employee_name: string;
  employee_avatar_url?: string | null;
}

interface OvertimeApprovalsProps {
  embedded?: boolean;
}

const OvertimeApprovals = ({ embedded }: OvertimeApprovalsProps) => {
  const { user: currentUser } = useCurrentUser();
  const [allRequests, setAllRequests] = useState<OvertimeRequestWithEmployee[]>([]);
  const [approved, setApproved] = useState<OvertimeRequestWithEmployee[]>([]);
  const [rejected, setRejected] = useState<OvertimeRequestWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<OvertimeRequestWithEmployee | null>(null);

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

  const fetchRequests = useCallback(async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setLoading(true);
    const ids = await fetchSupervisedIds();
    if (ids.length === 0) {
      setAllRequests([]);
      if (!silent) setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('overtime_requests')
      .select('*, employee:employees!employee_id(first_name, last_name, avatar_url), approver:employees!approved_by(first_name, last_name)')
      .in('employee_id', ids)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    const withName = (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown',
      employee_avatar_url: r.employee?.avatar_url ?? null,
      approver_name: r.approver ? `${r.approver.first_name} ${r.approver.last_name}` : null,
    }));
    setAllRequests(withName);
    if (!silent) setLoading(false);
  }, [currentUser?.id, fetchSupervisedIds]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('overtime-approvals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overtime_requests' }, () => {
        fetchRequests(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchRequests]);

  const handleApprove = async (id: string, action: 'approved' | 'rejected') => {
    setApproving(id);
    try {
      const { data } = await supabase.rpc('approve_overtime_request', {
        p_ot_id: id,
        p_action: action,
      });
      const result = data as { success: boolean; error?: string };
      if (result?.success) {
        toast.success(action === 'approved' ? 'Overtime approved' : 'Overtime rejected');
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

  const renderRequests = (requests: OvertimeRequestWithEmployee[], showActions: boolean) => {
    if (requests.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Timer className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No requests</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {requests.map((r) => (
          <Card
            key={r.id}
            className={cn('transition-colors', showActions && 'hover:border-primary/30')}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={r.employee_avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {r.employee_name.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.employee_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      {formatDate(r.date)} • {r.hours} hr(s) •{' '}
                      {formatTime(r.start_time)} – {formatTime(r.end_time)}
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
                  {showActions && r.status === 'pending' && (
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

  const content = (
    <>
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Overtime Approvals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Review and approve overtime requests from your team members
          </p>
        </div>
      )}

      <Card>
          <CardHeader>
            <CardTitle className="text-base">All Overtime Requests</CardTitle>
            <CardDescription>
              Review and approve overtime requests. Pending requests require your action.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderRequests(allRequests, true)
            )}
          </CardContent>
        </Card>
    </div>

      <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Overtime Request Details</DialogTitle>
            <DialogDescription>
              {viewingRequest &&
                `${viewingRequest.employee_name} • ${formatDate(viewingRequest.date)} • ${viewingRequest.hours} hr(s) • ${viewingRequest.status}`}
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
                  <span
                    className={cn(
                      'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
                      statusBadgeClass(viewingRequest.status)
                    )}
                  >
                    {viewingRequest.status}
                  </span>
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
  );

  return <RequireRole roles={['super_admin', 'admin', 'supervisor', 'manager']}>{content}</RequireRole>;
};

export default OvertimeApprovals;
