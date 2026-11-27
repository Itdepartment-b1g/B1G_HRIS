import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getAvatarFallbackFromFullName } from '@/lib/utils';
import { Loader2, Check, X, MapPin, Eye, Paperclip, Briefcase, CalendarDays, Search } from 'lucide-react';
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
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/components/QuickFilterSheet';
import { ALL_TIME_DATE_RANGE, type DateRangeFilterValue } from '@/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import type { BusinessTrip } from '@/types';

const TRIP_TYPE_LABELS: Record<string, string> = {
  work_visit_domestic: 'Work Visit (Domestic)',
  work_visit_overseas: 'Work Visit (Overseas)',
  training: 'Training',
};

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface BusinessTripWithEmployee extends BusinessTrip {
  employee_name: string;
  employee_avatar_url?: string | null;
  department?: string | null;
  position?: string | null;
}

type TripQuickColumn = 'employee' | 'department' | 'position' | 'trip_type';
type TripStatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const TripQuickFilterSheet = QuickFilterSheet<TripQuickColumn, TripStatusFilter>;

function uniqueOptions(items: Array<{ value: string; label: string }>) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.value.trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

interface BusinessTripApprovalsProps {
  embedded?: boolean;
}

const BusinessTripApprovals = ({ embedded }: BusinessTripApprovalsProps) => {
  const { user: currentUser } = useCurrentUser();
  const [allRequests, setAllRequests] = useState<BusinessTripWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<BusinessTripWithEmployee | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>(ALL_TIME_DATE_RANGE);
  const [columnClauses, setColumnClauses] = useState<QuickFilterAndClause<TripQuickColumn>[]>([
    createQuickFilterAndClause<TripQuickColumn>(),
  ]);
  const [statusFilter, setStatusFilter] = useState<TripStatusFilter>('all');

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
      .from('business_trips')
      .select(
        '*, employee:employees!employee_id(first_name, last_name, avatar_url, department, position), approver:employees!approved_by(first_name, last_name)'
      )
      .in('employee_id', ids)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false });
    const withName = (data || []).map((r: Record<string, unknown>) => {
      const emp = r.employee as
        | {
            first_name?: string;
            last_name?: string;
            avatar_url?: string | null;
            department?: string | null;
            position?: string | null;
          }
        | null
        | undefined;
      const approver = r.approver as { first_name?: string; last_name?: string } | null | undefined;
      return {
        ...r,
        employee_name: emp?.first_name && emp?.last_name ? `${emp.first_name} ${emp.last_name}` : 'Unknown',
        employee_avatar_url: emp?.avatar_url ?? null,
        department: emp?.department ?? null,
        position: emp?.position ?? null,
        approver_name:
          approver?.first_name && approver?.last_name
            ? `${approver.first_name} ${approver.last_name}`
            : null,
      };
    });
    setAllRequests(withName as BusinessTripWithEmployee[]);
    if (!silent) setLoading(false);
  }, [currentUser?.id, fetchSupervisedIds]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('business-trip-approvals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_trips' }, () => {
        fetchRequests(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchRequests]);

  const quickColumns = useMemo((): QuickFilterColumn<TripQuickColumn>[] => {
    return [
      {
        key: 'employee',
        label: 'Employee Name',
        searchPlaceholder: 'Search employee...',
        options: uniqueOptions(
          allRequests.map((r) => ({ value: r.employee_id, label: r.employee_name }))
        ),
      },
      {
        key: 'department',
        label: 'Department',
        searchPlaceholder: 'Search department...',
        options: uniqueOptions(
          allRequests
            .filter((r) => r.department)
            .map((r) => ({ value: r.department as string, label: r.department as string }))
        ),
      },
      {
        key: 'position',
        label: 'Rank/Position',
        searchPlaceholder: 'Search position...',
        options: uniqueOptions(
          allRequests
            .filter((r) => r.position)
            .map((r) => ({ value: r.position as string, label: r.position as string }))
        ),
      },
      {
        key: 'trip_type',
        label: 'Trip Type',
        searchPlaceholder: 'Search trip type...',
        options: uniqueOptions(
          allRequests
            .filter((r) => r.trip_type)
            .map((r) => ({
              value: r.trip_type as string,
              label: TRIP_TYPE_LABELS[r.trip_type ?? ''] ?? (r.trip_type as string),
            }))
        ),
      },
    ];
  }, [allRequests]);

  const filteredRequests = useMemo(() => {
    const { start, end } = getDateRangeFromPreset(dateRange.preset, dateRange.customStart, dateRange.customEnd);
    const q = search.trim().toLowerCase();
    return allRequests.filter((r) => {
      if (!isDateInRange(r.start_date, start, end)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (
        !matchesQuickFilterAndClauses(columnClauses, (field, value) => {
          if (field === 'employee') return r.employee_id === value;
          if (field === 'department') return (r.department || '') === value;
          if (field === 'position') return (r.position || '') === value;
          if (field === 'trip_type') return (r.trip_type || '') === value;
          return false;
        })
      ) {
        return false;
      }
      if (!q) return true;
      const typeLabel = (TRIP_TYPE_LABELS[r.trip_type ?? ''] ?? r.trip_type ?? '').toLowerCase();
      return (
        r.employee_name.toLowerCase().includes(q) ||
        (r.destination || '').toLowerCase().includes(q) ||
        (r.purpose || '').toLowerCase().includes(q) ||
        typeLabel.includes(q) ||
        (r.status || '').toLowerCase().includes(q) ||
        (r.department || '').toLowerCase().includes(q) ||
        (r.position || '').toLowerCase().includes(q) ||
        (r.approver_name || '').toLowerCase().includes(q)
      );
    });
  }, [allRequests, dateRange, columnClauses, statusFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, columnClauses, statusFilter, search]);

  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRequests.slice(start, start + PAGE_SIZE);
  }, [filteredRequests, page]);

  const statusOptions = useMemo(
    () => [
      { value: 'all' as const, label: 'All statuses', count: allRequests.length },
      { value: 'pending' as const, label: 'Pending', count: allRequests.filter((r) => r.status === 'pending').length },
      { value: 'approved' as const, label: 'Approved', count: allRequests.filter((r) => r.status === 'approved').length },
      { value: 'rejected' as const, label: 'Rejected', count: allRequests.filter((r) => r.status === 'rejected').length },
    ],
    [allRequests]
  );

  const clearQuickFilters = () => {
    setDateRange(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<TripQuickColumn>()]);
    setStatusFilter('all');
    setSearch('');
  };

  const handleApprove = async (id: string, action: 'approved' | 'rejected') => {
    setApproving(id);
    try {
      const { data } = await supabase.rpc('approve_trip_request', {
        p_trip_id: id,
        p_action: action,
      });
      const result = data as { success: boolean; error?: string };
      if (result?.success) {
        sendRequestNotification({ event: action, requestType: 'business_trip', requestId: id, approverId: currentUser?.id }).catch(() => {});
        createRequestInAppNotification({ event: action, requestType: 'business_trip', requestId: id, approverId: currentUser?.id }).catch(() => {});
        toast.success(action === 'approved' ? 'Business trip approved' : 'Business trip rejected');
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

  const renderRequests = (requests: BusinessTripWithEmployee[], showActions: boolean) => {
    if (requests.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {allRequests.length === 0 ? 'No business trip requests' : 'No requests match your filters'}
          </p>
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
                      {getAvatarFallbackFromFullName(r.employee_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {r.employee_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      {TRIP_TYPE_LABELS[r.trip_type ?? ''] ?? r.trip_type ?? '—'} • {r.destination}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(r.start_date)} – {formatDate(r.end_date)}
                    </p>
                    {r.purpose && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{r.purpose}</p>
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
            <h1 className="text-2xl font-bold">Business Trip Approvals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Review and approve business trip requests from your team members
            </p>
          </div>
        )}

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  All Business Trip Requests ({filteredRequests.length})
                </CardTitle>
                <CardDescription>
                  Review and approve business trip requests. Pending requests require your action.
                </CardDescription>
              </div>
              <TripQuickFilterSheet
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                columns={quickColumns}
                columnClauses={columnClauses}
                onColumnClausesChange={setColumnClauses}
                status={statusFilter}
                statusOptions={statusOptions}
                onStatusChange={setStatusFilter}
                onClear={clearQuickFilters}
              />
            </div>
            {allRequests.length > 0 && (
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by employee, location, purpose, type, or status..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {renderRequests(paginatedRequests, true)}
                <TablePagination
                  totalItems={filteredRequests.length}
                  currentPage={page}
                  onPageChange={setPage}
                  pageSize={PAGE_SIZE}
                  className="pt-2"
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewingRequest} onOpenChange={(open) => !open && setViewingRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Business Trip Request Details</DialogTitle>
            <DialogDescription>
              {viewingRequest &&
                `${viewingRequest.employee_name} • ${TRIP_TYPE_LABELS[viewingRequest.trip_type ?? ''] ?? viewingRequest.trip_type} • ${viewingRequest.destination} • ${viewingRequest.status}`}
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
                  <p className="text-muted-foreground">Trip Type</p>
                  <p className="font-medium">
                    {TRIP_TYPE_LABELS[viewingRequest.trip_type ?? ''] ?? viewingRequest.trip_type ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{viewingRequest.destination || '—'}</p>
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
                <div className="col-span-2">
                  <p className="text-muted-foreground">Dates</p>
                  <p className="font-medium mt-0.5">
                    {formatDate(viewingRequest.start_date)} – {formatDate(viewingRequest.end_date)}
                  </p>
                </div>
                {viewingRequest.purpose && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Purpose</p>
                    <p className="font-medium mt-0.5">{viewingRequest.purpose}</p>
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

  return (
    <RequireRole roles={['super_admin', 'admin', 'supervisor', 'manager']}>{content}</RequireRole>
  );
};

export default BusinessTripApprovals;
