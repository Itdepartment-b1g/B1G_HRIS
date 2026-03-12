import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Loader2, Plus, Check, X, FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { LeaveBalance, LeaveRequest } from '@/types';

const LEAVE_TYPES = [
  { value: 'vl', label: 'Vacation Leave (VL)' },
  { value: 'sl', label: 'Sick Leave (SL)' },
  { value: 'pto', label: 'Personal Time Off (PTO)' },
  { value: 'lwop', label: 'Leave Without Pay (LWOP)' },
] as const;

const DURATION_TYPES = [
  { value: 'fullday', label: 'Full Day' },
  { value: 'first_half', label: 'First Half' },
  { value: 'second_half', label: 'Second Half' },
] as const;

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const Leave = () => {
  const { user: currentUser } = useCurrentUser();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<(LeaveRequest & { employee_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [form, setForm] = useState({
    leave_type: 'vl' as const,
    start_date: '',
    end_date: '',
    leave_duration_type: 'fullday' as const,
    reason: '',
  });

  const isApprover =
    currentUser?.roles?.includes('super_admin') ||
    currentUser?.roles?.includes('admin') ||
    currentUser?.roles?.includes('supervisor') ||
    currentUser?.roles?.includes('manager');

  const fetchBalance = useCallback(async () => {
    if (!currentUser?.id) return;
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', currentUser.id)
      .eq('year', year)
      .maybeSingle();
    if (error) {
      console.error('Failed to fetch leave balance:', error);
      setBalance(null);
      return;
    }
    if (data) {
      setBalance({
        employee_id: data.employee_id,
        year: data.year,
        vl_balance: Number(data.vl_balance ?? 0),
        sl_balance: Number(data.sl_balance ?? 0),
        pto_balance: Number(data.pto_balance ?? 0),
        lwop_days_used: Number(data.lwop_days_used ?? 0),
      });
    } else {
      setBalance(null);
    }
  }, [currentUser?.id]);

  const refreshBalance = async () => {
    setBalanceRefreshing(true);
    await fetchBalance();
    setBalanceRefreshing(false);
    toast.success('Leave balance updated');
  };

  const fetchMyRequests = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('employee_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setMyRequests((data || []) as LeaveRequest[]);
  }, [currentUser?.id]);

  const fetchPendingRequests = useCallback(async () => {
    if (!currentUser?.id || !isApprover) return;
    const { data: esData } = await supabase
      .from('employee_supervisors')
      .select('employee_id')
      .eq('supervisor_id', currentUser.id);
    const supervisedIds = new Set((esData || []).map((r) => r.employee_id));
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
    const ids = Array.from(supervisedIds);
    if (ids.length === 0) {
      setPendingRequests([]);
      return;
    }
    const { data } = await supabase
      .from('leave_requests')
      .select('*, employee:employees!employee_id(first_name, last_name)')
      .in('employee_id', ids)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    const withName = (data || []).map((r: any) => ({
      ...r,
      employee_name: r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : 'Unknown',
    }));
    setPendingRequests(withName);
  }, [currentUser?.id, currentUser?.roles, isApprover]);

  const fetchAll = useCallback(() => {
    setLoading(true);
    Promise.all([fetchBalance(), fetchMyRequests(), fetchPendingRequests()]).finally(() => setLoading(false));
  }, [fetchBalance, fetchMyRequests, fetchPendingRequests]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('validate_and_submit_leave', {
        p_leave_type: form.leave_type,
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_leave_duration_type: form.leave_duration_type,
        p_reason: form.reason || null,
      });
      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Leave request submitted successfully');
        setFileDialogOpen(false);
        setForm({ leave_type: 'vl', start_date: '', end_date: '', leave_duration_type: 'fullday', reason: '' });
        fetchAll();
      } else {
        toast.error(result?.error || 'Failed to submit leave request');
      }
    } catch {
      toast.error('Failed to submit leave request');
    }
    setSubmitting(false);
  };

  const handleApprove = async (id: string, action: 'approved' | 'rejected') => {
    setApproving(id);
    try {
      const { data, error } = await supabase.rpc('approve_leave_request', {
        p_leave_id: id,
        p_action: action,
      });
      const result = data as { success: boolean; error?: string };
      if (result?.success) {
        toast.success(action === 'approved' ? 'Leave approved' : 'Leave rejected');
        fetchAll();
      } else {
        toast.error(result?.error || 'Action failed');
      }
    } catch {
      toast.error('Action failed');
    }
    setApproving(null);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Leave Management</h1>
        <p className="text-muted-foreground text-sm mt-1">View balances, file leave requests, and approve team leaves</p>
      </div>

      <Tabs defaultValue="my-leave">
        <TabsList>
          <TabsTrigger value="my-leave">My Leave</TabsTrigger>
          {isApprover && <TabsTrigger value="approvals">Approvals ({pendingRequests.length})</TabsTrigger>}
        </TabsList>

        <TabsContent value="my-leave" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Leave Balance ({year})</CardTitle>
                <CardDescription>Track your available leave credits. Annual entitlement: VL 15 days, SL 15 days, PTO 7 days.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={refreshBalance} disabled={balanceRefreshing}>
                {balanceRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </CardHeader>
            <CardContent>
              {!balance && loading === false ? (
                <p className="text-sm text-muted-foreground py-4">
                  No leave balance record yet. Balances are created for regular employees on Jan 1. Contact HR if you need assistance.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">VL (of 15)</p>
                    <p className="text-2xl font-bold">{balance?.vl_balance ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Vacation Leave remaining</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">SL (of 15)</p>
                    <p className="text-2xl font-bold">{balance?.sl_balance ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Sick Leave remaining</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">PTO (of 7)</p>
                    <p className="text-2xl font-bold">{balance?.pto_balance ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Personal Time Off remaining</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">LWOP Used</p>
                    <p className="text-2xl font-bold">{balance?.lwop_days_used ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Leave Without Pay (unlimited)</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">My Leave Requests</CardTitle>
              <Button onClick={() => setFileDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                File Leave
              </Button>
            </CardHeader>
            <CardContent>
              {myRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No leave requests yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myRequests.map((r) => (
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
                                ? 'bg-green-100 text-green-700'
                                : r.status === 'rejected'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isApprover && (
          <TabsContent value="approvals" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending Approvals</CardTitle>
                <CardDescription>Leave requests from your team members</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No pending requests</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.employee_name}</TableCell>
                          <TableCell className="uppercase">{r.leave_type}</TableCell>
                          <TableCell>
                            {formatDate(r.start_date)} – {formatDate(r.end_date)}
                          </TableCell>
                          <TableCell>{r.number_of_days ?? '—'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{r.reason || '—'}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleApprove(r.id, 'approved')}
                                disabled={approving === r.id}
                              >
                                {approving === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleApprove(r.id, 'rejected')}
                                disabled={approving === r.id}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>File Leave Request</DialogTitle>
            <DialogDescription>Submit a new leave request. VL requires 7 days notice. SL requires 2 hours before shift.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm((f) => ({ ...f, leave_type: v as typeof form.leave_type }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Reason for leave"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leave;
