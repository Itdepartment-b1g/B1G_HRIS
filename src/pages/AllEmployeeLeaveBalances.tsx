import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Loader2, Download, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { exportLeaveBalances } from '@/lib/exportLeaveBalances';
import { exportLeaveReport } from '@/lib/exportLeaveReport';
import {
  fetchApprovedLeaveUsageByYear,
  formatUsedDays,
  getUsedDays,
  type LeaveUsageMap,
} from '@/lib/leaveUsageAggregation';
import CtoHistoryDialog, { type CtoHistoryEmployee } from '@/components/CtoHistoryDialog';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/components/QuickFilterSheet';
import { ALL_TIME_DATE_RANGE, type DateRangeFilterValue } from '@/components/DateRangeFilterPopover';

interface LeaveTypeConfig {
  id: string;
  code: string;
  name: string;
  sort_order: number;
}

interface EmployeeRow {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  department?: string | null;
  position?: string | null;
}

interface LeaveBalanceRow {
  employee_id: string;
  year: number;
  vl_balance: number | null;
  sl_balance: number | null;
  pto_balance: number | null;
  lwop_days_used: number | null;
  balances?: Record<string, number> | null;
}

function getBalanceDisplayValue(lb: LeaveBalanceRow | null, code: string): string {
  if (!lb) return '---';
  if (code === 'lwop') return '---';
  if (code === 'vl') return lb.vl_balance != null ? String(lb.vl_balance) : '---';
  if (code === 'sl') return lb.sl_balance != null ? String(lb.sl_balance) : '---';
  if (code === 'pto') return lb.pto_balance != null ? String(lb.pto_balance) : '---';
  const v = lb.balances?.[code];
  return v != null ? String(v) : '---';
}

function getNumericValue(lb: LeaveBalanceRow | null, code: string): number | null {
  if (!lb) return null;
  if (code === 'lwop') return lb.lwop_days_used ?? null;
  if (code === 'vl') return lb.vl_balance ?? null;
  if (code === 'sl') return lb.sl_balance ?? null;
  if (code === 'pto') return lb.pto_balance ?? null;
  return lb.balances?.[code] ?? null;
}

function parseOptionalNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type LeaveBalanceQuickColumn = 'employee' | 'employee_code' | 'department' | 'position';
type LeaveBalanceStatusFilter = 'all' | 'has_credits' | 'no_credits';

const LeaveBalanceQuickFilterSheet = QuickFilterSheet<LeaveBalanceQuickColumn, LeaveBalanceStatusFilter>;

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

function employeeHasCredits(lb: LeaveBalanceRow | null, codes: string[]): boolean {
  if (!lb) return false;
  const values = [
    lb.vl_balance,
    lb.sl_balance,
    lb.pto_balance,
    ...codes.map((code) => lb.balances?.[code]),
  ];
  return values.some((v) => Number(v ?? 0) > 0);
}

/** Frozen columns — opaque backgrounds so scrolled cells don't show through */
const STICKY_FROZEN_BG = '!bg-white dark:!bg-[hsl(var(--card))]';
const STICKY_CODE_COL = `sticky left-0 z-20 w-28 min-w-28 max-w-28 ${STICKY_FROZEN_BG} group-hover:!bg-muted`;
const STICKY_NAME_COL = `sticky left-28 z-20 w-44 min-w-44 max-w-44 ${STICKY_FROZEN_BG} group-hover:!bg-muted shadow-[4px_0_6px_-2px_rgba(0,0,0,0.12)]`;
const STICKY_HEAD_COL = 'z-30';

const AllEmployeeLeaveBalances = () => {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [leaveTypeConfigs, setLeaveTypeConfigs] = useState<LeaveTypeConfig[]>([]);
  const [balanceMap, setBalanceMap] = useState<Map<string, LeaveBalanceRow>>(new Map());
  const [usageMap, setUsageMap] = useState<LeaveUsageMap>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [reportExportLoading, setReportExportLoading] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [draftByCode, setDraftByCode] = useState<Record<string, string>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);
  const [ctoDialogEmployee, setCtoDialogEmployee] = useState<CtoHistoryEmployee | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>(ALL_TIME_DATE_RANGE);
  const [columnClauses, setColumnClauses] = useState<QuickFilterAndClause<LeaveBalanceQuickColumn>[]>([
    createQuickFilterAndClause<LeaveBalanceQuickColumn>(),
  ]);
  const [statusFilter, setStatusFilter] = useState<LeaveBalanceStatusFilter>('all');

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setEditingEmployeeId(null);
    setDraftByCode({});

    const [empRes, lbRes, configRes] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_code, first_name, last_name, department, position')
        .eq('is_active', true)
        .order('employee_code'),
      supabase.from('leave_balances').select('*').eq('year', selectedYear),
      supabase.from('leave_type_config').select('id, code, name, sort_order').order('sort_order'),
    ]);

    const employeeIds = ((empRes.data as EmployeeRow[]) || []).map((e) => e.id);

    try {
      setUsageMap(await fetchApprovedLeaveUsageByYear(selectedYear, employeeIds.length > 0 ? employeeIds : undefined));
    } catch (err) {
      console.error('Failed to fetch leave usage:', err);
      setUsageMap(new Map());
    }

    if (empRes.error) {
      console.error('Failed to fetch employees:', empRes.error);
      setEmployees([]);
    } else {
      setEmployees((empRes.data as EmployeeRow[]) || []);
    }

    const map = new Map<string, LeaveBalanceRow>();
    (lbRes.data || []).forEach((row: LeaveBalanceRow) => {
      map.set(row.employee_id, row);
    });
    setBalanceMap(map);

    if (configRes.error) {
      console.error('Failed to fetch leave types:', configRes.error);
      setLeaveTypeConfigs([]);
    } else {
      setLeaveTypeConfigs((configRes.data as LeaveTypeConfig[]) || []);
    }

    setLoading(false);
  }, [selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const employeeName = (e: EmployeeRow) => [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';

  const dynamicLeaveCodes = useMemo(
    () => leaveTypeConfigs.map((c) => c.code).filter((code) => !['vl', 'sl', 'pto', 'lwop'].includes(code)),
    [leaveTypeConfigs]
  );

  const quickColumns = useMemo((): QuickFilterColumn<LeaveBalanceQuickColumn>[] => {
    return [
      {
        key: 'employee',
        label: 'Employee Name',
        searchPlaceholder: 'Search employee...',
        options: uniqueOptions(employees.map((e) => ({ value: e.id, label: employeeName(e) }))),
      },
      {
        key: 'employee_code',
        label: 'Employee Code',
        searchPlaceholder: 'Search code...',
        options: uniqueOptions(
          employees
            .filter((e) => e.employee_code)
            .map((e) => ({ value: e.employee_code, label: e.employee_code }))
        ),
      },
      {
        key: 'department',
        label: 'Department',
        searchPlaceholder: 'Search department...',
        options: uniqueOptions(
          employees
            .filter((e) => e.department)
            .map((e) => ({ value: e.department as string, label: e.department as string }))
        ),
      },
      {
        key: 'position',
        label: 'Rank/Position',
        searchPlaceholder: 'Search position...',
        options: uniqueOptions(
          employees
            .filter((e) => e.position)
            .map((e) => ({ value: e.position as string, label: e.position as string }))
        ),
      },
    ];
  }, [employees]);

  const statusOptions = useMemo(() => {
    const withCredits = employees.filter((e) =>
      employeeHasCredits(balanceMap.get(e.id) ?? null, dynamicLeaveCodes)
    ).length;
    return [
      { value: 'all' as const, label: 'All employees', count: employees.length },
      { value: 'has_credits' as const, label: 'Has leave credits', count: withCredits },
      { value: 'no_credits' as const, label: 'No leave credits', count: employees.length - withCredits },
    ];
  }, [employees, balanceMap, dynamicLeaveCodes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (q) {
        const name = `${e.first_name || ''} ${e.last_name || ''}`.toLowerCase().trim();
        const matchesSearch = (e.employee_code || '').toLowerCase().includes(q) || name.includes(q);
        if (!matchesSearch) return false;
      }

      const lb = balanceMap.get(e.id) ?? null;
      const hasCredits = employeeHasCredits(lb, dynamicLeaveCodes);
      if (statusFilter === 'has_credits' && !hasCredits) return false;
      if (statusFilter === 'no_credits' && hasCredits) return false;

      return matchesQuickFilterAndClauses(columnClauses, (field, value) => {
        if (field === 'employee') return e.id === value;
        if (field === 'employee_code') return e.employee_code === value;
        if (field === 'department') return (e.department || '') === value;
        if (field === 'position') return (e.position || '') === value;
        return false;
      });
    });
  }, [employees, search, columnClauses, statusFilter, balanceMap, dynamicLeaveCodes]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => setPage(1), [search, columnClauses, statusFilter]);

  const clearQuickFilters = () => {
    setDateRange(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<LeaveBalanceQuickColumn>()]);
    setStatusFilter('all');
  };

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    setExportLoading(true);
    try {
      await exportLeaveBalances({
        employees: filtered,
        balanceMap,
        leaveTypeConfigs,
        year: selectedYear,
        format,
        usageMap,
      });
      toast.success(`Leave balance report exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExportLoading(false);
    }
  };

  const handleLeaveReportExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    setReportExportLoading(true);
    try {
      await exportLeaveReport({
        year: selectedYear,
        employeeIds: filtered.map((e) => e.id),
        format,
      });
      toast.success(`Leave report exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export leave report');
    } finally {
      setReportExportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Number Of Leaves of All Employees</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View leave balances and approved leave usage for all employees ({selectedYear})
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Input
          type="number"
          min={2000}
          max={3000}
          value={selectedYear}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) setSelectedYear(next);
          }}
          className="w-full sm:w-32"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exportLoading || reportExportLoading}>
              {exportLoading || reportExportLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Leave Balance Report</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleExport('pdf')}>Balance PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>Balance CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>Balance XLSX</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Leave Report</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleLeaveReportExport('pdf')}>Leave Report PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleLeaveReportExport('csv')}>Leave Report CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleLeaveReportExport('xlsx')}>Leave Report XLSX</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Leave Balances ({filtered.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Year {selectedYear} — Used days are summed from approved leave requests. Click a CTO value to view overtime credit history.
            </p>
          </div>
          <LeaveBalanceQuickFilterSheet
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table className="border-separate border-spacing-0">
                <TableHeader>
                  <TableRow className="group">
                    <TableHead className={`${STICKY_CODE_COL} ${STICKY_HEAD_COL}`}>Employee Code</TableHead>
                    <TableHead className={`${STICKY_NAME_COL} ${STICKY_HEAD_COL}`}>Employee Name</TableHead>
                    {leaveTypeConfigs.map((c) => (
                      <Fragment key={c.id}>
                        <TableHead className="text-center whitespace-nowrap">
                          {c.name}
                          <span className="block text-xs font-normal text-muted-foreground">Balance</span>
                        </TableHead>
                        <TableHead className="text-center whitespace-nowrap">
                          {c.name}
                          <span className="block text-xs font-normal text-muted-foreground">Used</span>
                        </TableHead>
                      </Fragment>
                    ))}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((e) => {
                    const lb = balanceMap.get(e.id) ?? null;
                    const isEditing = editingEmployeeId === e.id;
                    const isSaving = savingEmployeeId === e.id;
                    return (
                      <TableRow key={e.id} className="group">
                        <TableCell className={`font-mono text-sm ${STICKY_CODE_COL}`}>
                          {e.employee_code || '—'}
                        </TableCell>
                        <TableCell className={`font-medium ${STICKY_NAME_COL}`}>{employeeName(e)}</TableCell>
                        {leaveTypeConfigs.map((c) => {
                          const isCto = c.code === 'cto';
                          const usedDays = getUsedDays(usageMap, e.id, c.code);
                          return (
                            <Fragment key={c.id}>
                              <TableCell className="font-mono text-sm text-center">
                                {isEditing ? (
                                  <Input
                                    type="number"
                                    step={isCto ? '0.001' : '0.01'}
                                    value={draftByCode[c.code] ?? ''}
                                    onChange={(ev) =>
                                      setDraftByCode((prev) => ({ ...prev, [c.code]: ev.target.value }))
                                    }
                                    className="h-8 w-24 mx-auto"
                                  />
                                ) : isCto ? (
                                  <button
                                    type="button"
                                    onClick={() => setCtoDialogEmployee(e)}
                                    title="View CTO history"
                                    className="font-mono text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                  >
                                    {getBalanceDisplayValue(lb, c.code)}
                                  </button>
                                ) : (
                                  getBalanceDisplayValue(lb, c.code)
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-sm text-center text-muted-foreground">
                                {isCto && !isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => setCtoDialogEmployee(e)}
                                    title="View CTO history"
                                    className="font-mono text-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                  >
                                    {formatUsedDays(usedDays)}
                                  </button>
                                ) : (
                                  formatUsedDays(usedDays)
                                )}
                              </TableCell>
                            </Fragment>
                          );
                        })}
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={async () => {
                                  setSavingEmployeeId(e.id);
                                  try {
                                    const row = balanceMap.get(e.id) ?? null;
                                    const existingBalances = row?.balances ?? {};
                                    const nextBalances: Record<string, number> = {};
                                    const dynamicCodes = leaveTypeConfigs
                                      .map((cfg) => cfg.code)
                                      .filter((code) => !['vl', 'sl', 'pto', 'lwop'].includes(code));

                                    for (const code of dynamicCodes) {
                                      const parsed = parseOptionalNumber(draftByCode[code] ?? '');
                                      if (parsed != null) nextBalances[code] = parsed;
                                    }

                                    const payload: Record<string, unknown> = {
                                      employee_id: e.id,
                                      year: selectedYear,
                                      vl_balance: parseOptionalNumber(draftByCode.vl ?? ''),
                                      sl_balance: parseOptionalNumber(draftByCode.sl ?? ''),
                                      pto_balance: parseOptionalNumber(draftByCode.pto ?? ''),
                                      lwop_days_used: parseOptionalNumber(draftByCode.lwop ?? ''),
                                      balances: { ...existingBalances, ...nextBalances },
                                    };

                                    const { data, error } = await supabase
                                      .from('leave_balances')
                                      .upsert(payload, { onConflict: 'employee_id,year' })
                                      .select('*')
                                      .single();

                                    if (error) throw error;

                                    setBalanceMap((prev) => {
                                      const next = new Map(prev);
                                      next.set(e.id, data as LeaveBalanceRow);
                                      return next;
                                    });
                                    setEditingEmployeeId(null);
                                    setDraftByCode({});
                                    toast.success('Leave balances updated');
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : 'Failed to update leave balances');
                                  } finally {
                                    setSavingEmployeeId(null);
                                  }
                                }}
                                disabled={isSaving}
                              >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingEmployeeId(null);
                                  setDraftByCode({});
                                }}
                                disabled={isSaving}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const row = balanceMap.get(e.id) ?? null;
                                const nextDraft: Record<string, string> = {};
                                leaveTypeConfigs.forEach((cfg) => {
                                  const v = getNumericValue(row, cfg.code);
                                  nextDraft[cfg.code] = v == null ? '' : String(v);
                                });
                                setDraftByCode(nextDraft);
                                setEditingEmployeeId(e.id);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3 + leaveTypeConfigs.length * 2}
                        className="text-center text-muted-foreground py-8"
                      >
                        No employees found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {!loading && filtered.length > 0 && (
                <TablePagination totalItems={filtered.length} currentPage={page} onPageChange={setPage} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CtoHistoryDialog
        open={!!ctoDialogEmployee}
        onOpenChange={(open) => {
          if (!open) setCtoDialogEmployee(null);
        }}
        employee={ctoDialogEmployee}
        year={selectedYear}
        currentBalance={ctoDialogEmployee ? getNumericValue(balanceMap.get(ctoDialogEmployee.id) ?? null, 'cto') : null}
        usedDays={ctoDialogEmployee ? getUsedDays(usageMap, ctoDialogEmployee.id, 'cto') : 0}
      />
    </div>
  );
};

export default AllEmployeeLeaveBalances;
