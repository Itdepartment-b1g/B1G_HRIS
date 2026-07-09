import { useEffect, useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type QuickRangeKey =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'last_year'
  | 'all_time';

interface DateRangeValue {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  allTimeFrom?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

const QUICK_RANGE_OPTIONS: Array<{ key: QuickRangeKey; label: string }> = [
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'last_3_months', label: 'Last 3 Months' },
  { key: 'last_6_months', label: 'Last 6 Months' },
  { key: 'this_year', label: 'This Year' },
  { key: 'last_year', label: 'Last Year' },
  { key: 'all_time', label: 'All Time' },
];

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildRange(preset: QuickRangeKey, allTimeFrom: string): DateRangeValue {
  const now = new Date();
  const today = toDateString(now);

  if (preset === 'all_time') {
    return { from: allTimeFrom, to: today };
  }

  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toDateString(from), to: today };
  }

  if (preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: toDateString(from), to: toDateString(to) };
  }

  if (preset === 'last_3_months') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { from: toDateString(from), to: today };
  }

  if (preset === 'last_6_months') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 6);
    return { from: toDateString(from), to: today };
  }

  if (preset === 'this_year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: toDateString(from), to: today };
  }

  const from = new Date(now.getFullYear() - 1, 0, 1);
  const to = new Date(now.getFullYear() - 1, 11, 31);
  return { from: toDateString(from), to: toDateString(to) };
}

function formatRangeLabel(value: DateRangeValue): string {
  if (!value.from || !value.to) return 'Select date range';
  return `${value.from} to ${value.to}`;
}

export function DateRangeFilter({
  value,
  onChange,
  allTimeFrom = '2000-01-01',
  className,
  triggerClassName,
  disabled,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  useEffect(() => {
    if (!open) {
      setDraftFrom(value.from);
      setDraftTo(value.to);
    }
  }, [open, value.from, value.to]);

  const triggerLabel = useMemo(() => formatRangeLabel(value), [value]);

  const applyCustomRange = () => {
    if (!draftFrom || !draftTo) return;
    const normalized = draftFrom <= draftTo
      ? { from: draftFrom, to: draftTo }
      : { from: draftTo, to: draftFrom };
    onChange(normalized);
    setOpen(false);
  };

  const applyQuickRange = (preset: QuickRangeKey) => {
    onChange(buildRange(preset, allTimeFrom));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-9 justify-between gap-2 text-left font-normal text-sm', triggerClassName)}
        >
          <span className="truncate">{triggerLabel}</span>
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn('w-[360px] max-w-[calc(100vw-2rem)] rounded-xl p-3', className)}>
        <div className="space-y-4">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">QUICK FILTERS</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_RANGE_OPTIONS.map((option) => {
                const isAllTime = option.key === 'all_time';
                return (
                  <Button
                    key={option.key}
                    type="button"
                    variant={isAllTime ? 'default' : 'outline'}
                    className={cn(
                      'h-10 rounded-lg text-sm',
                      isAllTime ? 'col-span-2' : undefined
                    )}
                    onClick={() => applyQuickRange(option.key)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="space-y-2.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">CUSTOM RANGE</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date-range-from" className="text-sm">From</Label>
                  <Input
                    id="date-range-from"
                    type="date"
                    value={draftFrom}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    max={draftTo || undefined}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date-range-to" className="text-sm">To</Label>
                  <Input
                    id="date-range-to"
                    type="date"
                    value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                    min={draftFrom || undefined}
                    className="h-10"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={applyCustomRange} disabled={!draftFrom || !draftTo}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
