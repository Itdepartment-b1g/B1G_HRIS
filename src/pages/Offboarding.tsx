import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardList, Loader2, Plus, Search, Settings2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { cn } from '@/lib/utils';
import {
  clearanceProgress,
  fetchClearances,
  fetchTemplate,
  formatClearanceDate,
  isHrAdmin,
  manilaToday,
  runClearanceSchedule,
  startClearance,
  userOwesSignature,
  type ClearanceRecord,
  type ClearanceStatus,
  type TemplateSection,
} from '@/lib/offboarding';

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  employee_code: string | null;
  department: string | null;
  position: string | null;
  is_active: boolean;
}

const STATUS_LABEL: Record<ClearanceStatus, string> = {
  in_progress: 'In progress',
  cleared: 'Cleared',
  cancelled: 'Cancelled',
};

const emptyForm = () => ({
  resignationSubmittedOn: '',
  lastWorkingDay: '',
  acceptanceDate: manilaToday(),
  reason: '',
  dailyMonthlyRate: '',
  grossPay: '',
});

const Offboarding = () => {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const admin = isHrAdmin(user?.roles);
  const [rows, setRows] = useState<ClearanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ClearanceStatus | 'all'>('in_progress');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const [createOpen, setCreateOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [openEmployeeIds, setOpenEmployeeIds] = useState<Set<string>>(new Set());
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [templateItems, setTemplateItems] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (admin) {
        try {
          await runClearanceSchedule();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to check last working days';
          if (!message.includes('supabase-migration-exit-clearance.sql')) toast.error(message);
        }
      }
      setRows(await fetchClearances());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load exit clearances');
      setRows([]);
    }
    setLoading(false);
  }, [admin]);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id, load]);

  const openCreate = async () => {
    setCreateOpen(true);
    setForm(emptyForm());
    setSelectedEmployeeId('');
    setEmployeeSearch('');
    const [empRes, openRes, template] = await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, last_name, employee_code, department, position, is_active')
        .order('last_name'),
      supabase.from('employee_clearances').select('employee_id').eq('status', 'in_progress'),
      fetchTemplate().catch((): TemplateSection[] => []),
    ]);
    if (empRes.error) toast.error(empRes.error.message);
    else setEmployees((empRes.data ?? []) as EmployeeOption[]);
    setOpenEmployeeIds(new Set((openRes.data ?? []).map((row) => row.employee_id as string)));
    setTemplateItems(template.reduce((sum, section) => sum + section.items.length, 0));
  };

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) => {
      if (!includeInactive && !employee.is_active) return false;
      if (!query) return true;
      return `${employee.first_name} ${employee.last_name} ${employee.employee_code ?? ''} ${employee.department ?? ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [employees, employeeSearch, includeInactive]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!query) return true;
      return `${row.employee_name} ${row.employee_code ?? ''} ${row.department_name ?? ''} ${row.position_name ?? ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [rows, search, statusFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, pageSize]);

  const pendingCases = rows.filter((row) => row.status === 'in_progress' && clearanceProgress(row.sections).pendingTitles.length > 0).length;

  const submit = async () => {
    if (!selectedEmployeeId) {
      toast.error('Select the employee who resigned');
      return;
    }
    if (!form.resignationSubmittedOn || !form.lastWorkingDay || !form.acceptanceDate) {
      toast.error('Resignation letter date, last working day, and acceptance date are required');
      return;
    }
    if (openEmployeeIds.has(selectedEmployeeId)) {
      toast.error('This employee already has an exit clearance in progress');
      return;
    }
    setSaving(true);
    try {
      const id = await startClearance({
        employeeId: selectedEmployeeId,
        resignationSubmittedOn: form.resignationSubmittedOn,
        lastWorkingDay: form.lastWorkingDay,
        acceptanceDate: form.acceptanceDate,
        reason: form.reason,
        dailyMonthlyRate: form.dailyMonthlyRate,
        grossPay: form.grossPay,
      });
      toast.success(
        form.lastWorkingDay <= manilaToday()
          ? 'Exit clearance started. Department heads were notified.'
          : 'Exit clearance started. Department heads will be notified on the last working day.'
      );
      setCreateOpen(false);
      navigate(`/dashboard/offboarding/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start the exit clearance');
    }
    setSaving(false);
  };

  if (!user) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Offboarding</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {admin
              ? 'Start an exit clearance after a resignation letter is received, then follow which departments still need to sign.'
              : 'Sign the exit clearance items for your department. You only see clearances that need your signature.'}
          </p>
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/dashboard/offboarding/template')}>
              <Settings2 className="h-4 w-4 mr-2" />
              Checklist
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New clearance
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[11px] sm:text-xs leading-tight text-muted-foreground">Waiting on a signature</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">{pendingCases}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[11px] sm:text-xs leading-tight text-muted-foreground">In progress</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">{rows.filter((row) => row.status === 'in_progress').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 sm:p-4">
            <p className="text-[11px] sm:text-xs leading-tight text-muted-foreground">Cleared</p>
            <p className="text-xl sm:text-2xl font-semibold mt-1">{rows.filter((row) => row.status === 'cleared').length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {(['in_progress', 'cleared', 'cancelled', 'all'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              className="shrink-0"
              variant={statusFilter === value ? 'default' : 'outline'}
              onClick={() => setStatusFilter(value)}
            >
              {value === 'all' ? 'All' : STATUS_LABEL[value]}
            </Button>
          ))}
        </div>
        <div className="relative sm:ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or employee no."
            className="pl-9"
          />
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Loading clearances
          </p>
        ) : paged.length === 0 ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {rows.length === 0
              ? admin
                ? 'No exit clearances yet.'
                : 'No exit clearance is assigned to you.'
              : 'Nothing matches this filter.'}
          </div>
        ) : (
          paged.map((row) => {
            const progress = clearanceProgress(row.sections);
            const owes = user?.id ? userOwesSignature(row, user.id) : false;
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => navigate(`/dashboard/offboarding/${row.id}`)}
                className="w-full text-left rounded-lg border bg-card p-3 space-y-2 active:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{row.employee_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[row.employee_code, row.position_name, row.department_name].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0',
                      row.status === 'cleared' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                      row.status === 'in_progress' && 'border-amber-200 bg-amber-50 text-amber-800',
                      row.status === 'cancelled' && 'text-muted-foreground'
                    )}
                  >
                    {STATUS_LABEL[row.status]}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Last working day</p>
                    <p>{formatClearanceDate(row.last_working_day)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">Signed</p>
                    <p>{progress.total > 0 ? `${progress.cleared} of ${progress.total}` : '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Still pending</p>
                  <p className="text-sm">
                    {row.status !== 'in_progress'
                      ? '—'
                      : progress.pendingTitles.length === 0
                        ? 'No items yet'
                        : progress.pendingTitles.join(', ')}
                  </p>
                </div>
                {owes && <Badge>Your signature</Badge>}
              </button>
            );
          })
        )}
      </div>

      <div className="hidden md:block border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Last working day</TableHead>
              <TableHead>Clearance</TableHead>
              <TableHead>Still pending</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading clearances
                </TableCell>
              </TableRow>
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  {rows.length === 0
                    ? admin
                      ? 'No exit clearances yet.'
                      : 'No exit clearance is assigned to you.'
                    : 'Nothing matches this filter.'}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row) => {
                const progress = clearanceProgress(row.sections);
                const owes = user?.id ? userOwesSignature(row, user.id) : false;
                return (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/dashboard/offboarding/${row.id}`)}>
                    <TableCell>
                      <div className="font-medium">{row.employee_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[row.employee_code, row.position_name, row.department_name].filter(Boolean).join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell>{formatClearanceDate(row.last_working_day)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            row.status === 'cleared' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                            row.status === 'in_progress' && 'border-amber-200 bg-amber-50 text-amber-800',
                            row.status === 'cancelled' && 'text-muted-foreground'
                          )}
                        >
                          {STATUS_LABEL[row.status]}
                        </Badge>
                        {progress.total > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {progress.cleared} of {progress.total} signed
                          </span>
                        )}
                        {owes && <Badge>Your signature</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      {row.status !== 'in_progress' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : progress.pendingTitles.length === 0 ? (
                        <span className="text-muted-foreground">No items yet</span>
                      ) : (
                        <span className="text-sm">{progress.pendingTitles.join(', ')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); navigate(`/dashboard/offboarding/${row.id}`); }}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        totalItems={visible.length}
        currentPage={page}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Start exit clearance</DialogTitle>
            <DialogDescription>
              Record the resignation letter, then copy the current checklist. The employee stays active until every item is signed.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Search name or employee no." className="pl-9" />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />
                Include inactive employees
              </label>
              <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
                {filteredEmployees.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No matching employees</p>
                ) : (
                  filteredEmployees.map((employee) => {
                    const open = openEmployeeIds.has(employee.id);
                    const active = employee.id === selectedEmployeeId;
                    return (
                      <button
                        key={employee.id}
                        type="button"
                        disabled={open}
                        onClick={() => setSelectedEmployeeId(employee.id)}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50',
                          active && 'bg-primary/5'
                        )}
                      >
                        <span className="font-medium">{employee.last_name}, {employee.first_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[employee.employee_code, employee.position, employee.department].filter(Boolean).join(' · ')}
                          {open ? ' · Clearance already open' : ''}
                          {!employee.is_active ? ' · Inactive' : ''}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="resignation-date">Resignation letter submitted</Label>
                <Input id="resignation-date" type="date" value={form.resignationSubmittedOn} onChange={(event) => setForm({ ...form, resignationSubmittedOn: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last-day">Actual last working day</Label>
                <Input id="last-day" type="date" value={form.lastWorkingDay} onChange={(event) => setForm({ ...form, lastWorkingDay: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acceptance-date">Acceptance date</Label>
                <Input id="acceptance-date" type="date" value={form.acceptanceDate} onChange={(event) => setForm({ ...form, acceptanceDate: event.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rate">Daily / month rate</Label>
                  <Input id="rate" value={form.dailyMonthlyRate} onChange={(event) => setForm({ ...form, dailyMonthlyRate: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gross">Gross</Label>
                  <Input id="gross" value={form.grossPay} onChange={(event) => setForm({ ...form, grossPay: event.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Reason for resignation</Label>
                <Textarea id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Optional" />
              </div>
              {templateItems === 0 && (
                <p className="text-sm text-amber-700">
                  The checklist has no items yet. Open Checklist and add the departments and items first.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || templateItems === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start clearance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Offboarding;
