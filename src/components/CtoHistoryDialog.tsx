import { useEffect, useMemo, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  fetchCtoHistory,
  formatCtoFixed,
  formatOtHours,
  type CtoHistoryResult,
  type CtoHistoryRow,
} from '@/lib/ctoHistory';
import { CtoFormulaGuide } from '@/components/CtoFormulaGuide';
import {
  QuickFilterSheet,
  createQuickFilterAndClause,
  matchesQuickFilterAndClauses,
  type QuickFilterAndClause,
  type QuickFilterColumn,
} from '@/components/QuickFilterSheet';
import { ALL_TIME_DATE_RANGE, type DateRangeFilterValue } from '@/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { cn } from '@/lib/utils';

export interface CtoHistoryEmployee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

interface CtoHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: CtoHistoryEmployee | null;
  year: number;
  currentBalance: number | null;
  usedDays: number;
}

const DURATION_LABELS: Record<string, string> = {
  fullday: 'Full Day',
  first_half: 'First Half',
  second_half: 'Second Half',
};

type CtoQuickColumn = 'source' | 'filed_by' | 'approved_by' | 'duration';
type CtoQuickStatus = 'all' | 'credit' | 'usage';

const CtoQuickFilterSheet = QuickFilterSheet<CtoQuickColumn, CtoQuickStatus>;

function uniqueOptions(items: Array<{ value: string; label: string }>) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = item.value.trim();
      if (!key || key === '—' || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function employeeName(employee: CtoHistoryEmployee): string {
  return [employee.first_name, employee.last_name].filter(Boolean).join(' ') || '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return timeStr;
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDelta(value: number): string {
  const formatted = formatCtoFixed(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

function preventCloseFromQuickFilter(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[data-quick-filter-sheet]')) event.preventDefault();
}

const CtoHistoryDialog = ({
  open,
  onOpenChange,
  employee,
  year,
  currentBalance,
  usedDays,
}: CtoHistoryDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CtoHistoryResult | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>(ALL_TIME_DATE_RANGE);
  const [columnClauses, setColumnClauses] = useState<QuickFilterAndClause<CtoQuickColumn>[]>([
    createQuickFilterAndClause<CtoQuickColumn>(),
  ]);
  const [statusFilter, setStatusFilter] = useState<CtoQuickStatus>('all');

  useEffect(() => {
    if (!open || !employee) {
      setHistory(null);
      setError(null);
      setLoading(false);
      setDateRange(ALL_TIME_DATE_RANGE);
      setColumnClauses([createQuickFilterAndClause<CtoQuickColumn>()]);
      setStatusFilter('all');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCtoHistory(employee.id, year);
        if (!cancelled) setHistory(result);
      } catch (err) {
        if (!cancelled) {
          setHistory(null);
          setError(err instanceof Error ? err.message : 'Failed to load CTO history');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, employee, year]);

  const rows = history?.rows ?? [];

  const quickColumns = useMemo((): QuickFilterColumn<CtoQuickColumn>[] => {
    return [
      {
        key: 'source',
        label: 'Source',
        searchPlaceholder: 'Search source...',
        options: uniqueOptions(rows.map((row) => ({ value: row.source, label: row.sourceLabel }))),
      },
      {
        key: 'filed_by',
        label: 'Filed by',
        searchPlaceholder: 'Search filer...',
        options: uniqueOptions(rows.map((row) => ({ value: row.details.filedBy, label: row.details.filedBy }))),
      },
      {
        key: 'approved_by',
        label: 'Approved by',
        searchPlaceholder: 'Search approver...',
        options: uniqueOptions(rows.map((row) => ({ value: row.details.approvedBy, label: row.details.approvedBy }))),
      },
      {
        key: 'duration',
        label: 'Duration',
        searchPlaceholder: 'Search duration...',
        options: uniqueOptions(
          rows
            .filter((row) => row.source === 'leave')
            .map((row) => {
              const value = row.details.durationType || 'fullday';
              return { value, label: DURATION_LABELS[value] ?? 'Full Day' };
            })
        ),
      },
    ];
  }, [rows]);

  const statusOptions = useMemo(() => {
    const credits = rows.filter((row) => row.source === 'overtime').length;
    return [
      { value: 'all' as const, label: 'All transactions', count: rows.length },
      { value: 'credit' as const, label: 'CTO credited', count: credits },
      { value: 'usage' as const, label: 'CTO used', count: rows.length - credits },
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const { start, end } = getDateRangeFromPreset(dateRange.preset, dateRange.customStart, dateRange.customEnd);
    return rows.filter((row) => {
      if (!isDateInRange(row.date, start, end)) return false;
      if (statusFilter === 'credit' && row.source !== 'overtime') return false;
      if (statusFilter === 'usage' && row.source !== 'leave') return false;
      return matchesQuickFilterAndClauses(columnClauses, (field, value) => {
        if (field === 'source') return row.source === value;
        if (field === 'filed_by') return row.details.filedBy === value;
        if (field === 'approved_by') return row.details.approvedBy === value;
        if (field === 'duration') return (row.details.durationType || 'fullday') === value;
        return false;
      });
    });
  }, [rows, dateRange, columnClauses, statusFilter]);

  const clearQuickFilters = () => {
    setDateRange(ALL_TIME_DATE_RANGE);
    setColumnClauses([createQuickFilterAndClause<CtoQuickColumn>()]);
    setStatusFilter('all');
  };

  const reconstructed = history
    ? Math.round((history.totalEarned - history.totalUsed) * 1000) / 1000
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-4xl overflow-x-auto"
        onInteractOutside={preventCloseFromQuickFilter}
        onPointerDownOutside={preventCloseFromQuickFilter}
        onFocusOutside={preventCloseFromQuickFilter}
      >
        <DialogHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between space-y-0 pr-8">
          <div>
            <DialogTitle>CTO History</DialogTitle>
            <DialogDescription>
              {employee
                ? `${employeeName(employee)}${employee.employee_code ? ` (${employee.employee_code})` : ''} • ${year}`
                : `Year ${year}`}
            </DialogDescription>
          </div>
          <CtoQuickFilterSheet
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
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-6">{error}</p>
        ) : (
          <div className="space-y-4 min-w-0">
            <CtoFormulaGuide />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryTile label="Total earned" value={formatCtoFixed(history?.totalEarned ?? 0)} />
              <SummaryTile label="Total used" value={formatCtoFixed(history?.totalUsed ?? usedDays)} />
              <SummaryTile
                label="Current balance"
                value={currentBalance == null ? '---' : formatCtoFixed(currentBalance)}
              />
              <SummaryTile
                label="Total accumulated"
                value={reconstructed == null ? '---' : formatCtoFixed(reconstructed)}
              />
            </div>

            {history && history.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No approved overtime credited to CTO for this year.
              </p>
            ) : filteredRows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No CTO transactions match the current Quick Filter.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <div className="hidden md:grid grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,auto)_minmax(6.5rem,auto)_minmax(7rem,auto)_1.5rem] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/40">
                  <span>Date of approved OT</span>
                  <span className="text-right">OT hours</span>
                  <span className="text-right">CTO credited</span>
                  <span className="text-right">Total accumulated</span>
                  <span />
                </div>
                <Accordion type="multiple" className="min-w-[28rem] md:min-w-0">
                  {filteredRows.map((row) => (
                    <AccordionItem key={row.id} value={row.id} className="px-3">
                      <AccordionTrigger className="hover:no-underline py-3 items-start md:items-center">
                        <div className="grid w-full min-w-0 grid-cols-1 md:grid-cols-[minmax(8rem,1.4fr)_minmax(5rem,auto)_minmax(6.5rem,auto)_minmax(7rem,auto)] gap-1 md:gap-3 pr-2 text-left">
                          <div>
                            <p className="text-sm font-medium">{formatDate(row.date)}</p>
                            <p className="text-xs text-muted-foreground">{row.sourceLabel}</p>
                          </div>
                          <p className="font-mono text-sm md:text-right">
                            {row.otHours == null ? '—' : formatOtHours(row.otHours)}
                          </p>
                          <p
                            className={cn(
                              'font-mono text-sm md:text-right',
                              row.ctoDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                            )}
                          >
                            {formatDelta(row.ctoDelta)}
                          </p>
                          <p className="font-mono text-sm font-medium md:text-right">
                            {formatCtoFixed(row.runningTotal)}
                          </p>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <HistoryDetails row={row} />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function HistoryDetails({ row }: { row: CtoHistoryRow }) {
  const d = row.details;
  const leaveRange =
    row.source === 'leave'
      ? d.endDate && d.endDate !== row.date
        ? `${formatDate(row.date)} – ${formatDate(d.endDate)}`
        : formatDate(row.date)
      : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm border-t pt-3">
      <Detail label="Filed by" value={`${d.filedBy}${d.filedOnBehalf ? ' (on behalf)' : ''}`} />
      <Detail label="Filed at" value={formatDateTime(d.filedAt)} />
      <Detail label="Approved by" value={d.approvedBy} />
      <Detail label="Approved at" value={formatDateTime(d.approvedAt)} />
      <Detail label="Status" value={d.status} className="capitalize" />

      {row.source === 'overtime' ? (
        <Detail label="OT time" value={`${formatTime(d.startTime)} – ${formatTime(d.endTime)}`} />
      ) : (
        <>
          <Detail label="Leave dates" value={leaveRange ?? '—'} />
          <Detail label="Duration" value={DURATION_LABELS[d.durationType || 'fullday'] ?? 'Full Day'} />
        </>
      )}

      {d.reason && (
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Reason</p>
          <p className="font-medium mt-0.5 whitespace-pre-wrap">{d.reason}</p>
        </div>
      )}
      {d.attachmentUrl && (
        <div className="sm:col-span-2">
          <p className="text-muted-foreground">Attachment</p>
          <a
            href={d.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1.5 mt-0.5"
          >
            <Paperclip className="h-3.5 w-3.5" />
            View attachment
          </a>
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={cn('font-medium mt-0.5 break-words', className)}>{value}</p>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium mt-0.5 break-all">{value}</p>
    </div>
  );
}

export default CtoHistoryDialog;
