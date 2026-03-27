import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Loader2, Download, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { exportLeaveBalances } from '@/lib/exportLeaveBalances';

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

function getDisplayValue(lb: LeaveBalanceRow | null, code: string): string {
  if (!lb) return '---';
  if (code === 'lwop') return lb.lwop_days_used != null ? String(lb.lwop_days_used) : '---';
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

const AllEmployeeLeaveBalances = () => {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [leaveTypeConfigs, setLeaveTypeConfigs] = useState<LeaveTypeConfig[]>([]);
  const [balanceMap, setBalanceMap] = useState<Map<string, LeaveBalanceRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [draftByCode, setDraftByCode] = useState<Record<string, string>>({});
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setEditingEmployeeId(null);
    setDraftByCode({});

    const [empRes, lbRes, configRes] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_code, first_name, last_name')
        .eq('is_active', true)
        .order('employee_code'),
      supabase.from('leave_balances').select('*').eq('year', selectedYear),
      supabase.from('leave_type_config').select('id, code, name, sort_order').order('sort_order'),
    ]);

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

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        (e.employee_code || '').toLowerCase().includes(q) ||
        `${(e.first_name || '')} ${(e.last_name || '')}`.toLowerCase().trim().includes(q)
    );
  }, [employees, search]);

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => setPage(1), [search]);

  const employeeName = (e: EmployeeRow) => [e.first_name, e.last_name].filter(Boolean).join(' ') || '—';

  const handleExport = async (format: 'pdf' | 'csv' | 'xlsx') => {
    setExportLoading(true);
    try {
      exportLeaveBalances({
        employees: filtered,
        balanceMap,
        leaveTypeConfigs,
        year: selectedYear,
        format,
      });
      toast.success(`Leave balances exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Number Of Leaves of All Employees</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View leave balances for all employees ({selectedYear})
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
            <Button variant="outline" size="sm" disabled={exportLoading}>
              {exportLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExport('pdf')}>Export PDF</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('csv')}>Export CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport('xlsx')}>Export XLSX</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Balances ({filtered.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Year {selectedYear}</p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee Code</TableHead>
                    <TableHead>Employee Name</TableHead>
                    {leaveTypeConfigs.map((c) => (
                      <TableHead key={c.id}>{c.name}</TableHead>
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
                      <TableRow key={e.id}>
                        <TableCell className="font-mono text-sm">{e.employee_code || '—'}</TableCell>
                        <TableCell className="font-medium">{employeeName(e)}</TableCell>
                        {leaveTypeConfigs.map((c) => (
                          <TableCell key={c.id} className="font-mono text-sm">
                            {isEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={draftByCode[c.code] ?? ''}
                                onChange={(ev) =>
                                  setDraftByCode((prev) => ({ ...prev, [c.code]: ev.target.value }))
                                }
                                className="h-8 w-24"
                              />
                            ) : (
                              getDisplayValue(lb, c.code)
                            )}
                          </TableCell>
                        ))}
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
                        colSpan={3 + leaveTypeConfigs.length}
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
    </div>
  );
};

export default AllEmployeeLeaveBalances;
