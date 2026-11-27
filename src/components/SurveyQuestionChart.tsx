import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { isChoiceAnswerType } from '@/lib/surveyAnswers';
import { cn } from '@/lib/utils';

const BRAND = '#472160';
const PALETTE = ['#472160', '#6B3A8C', '#8B5CF6', '#A78BFA', '#C4B5FD', '#5B21B6', '#7C3AED'];

type ChartRow = {
  key: string;
  label: string;
  count: number;
  fill: string;
};

interface SurveyQuestionChartProps {
  answerType: string;
  mcCounts?: Record<string, number>;
  ratingCounts?: Record<number, number>;
  options?: string[];
  ratingAvg?: number | null;
  className?: string;
}

function slugKey(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return `opt_${index}_${base || 'x'}`;
}

function buildChoiceRows(
  mcCounts: Record<string, number>,
  options?: string[]
): ChartRow[] {
  const labels =
    options && options.length > 0
      ? [...options]
      : Object.keys(mcCounts);
  const seen = new Set(labels);
  for (const key of Object.keys(mcCounts)) {
    if (!seen.has(key)) labels.push(key);
  }
  return labels.map((label, i) => ({
    key: slugKey(label, i),
    label,
    count: mcCounts[label] ?? 0,
    fill: PALETTE[i % PALETTE.length],
  }));
}

function buildRatingRows(ratingCounts: Record<number, number>): ChartRow[] {
  return [1, 2, 3, 4, 5].map((n, i) => ({
    key: `rating_${n}`,
    label: String(n),
    count: ratingCounts[n] ?? 0,
    fill: PALETTE[i % PALETTE.length],
  }));
}

function CountLegend({
  rows,
  total,
  showPercent,
}: {
  rows: ChartRow[];
  total: number;
  showPercent?: boolean;
}) {
  return (
    <ul className="space-y-2 min-w-[9.5rem]">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <li key={row.key} className="flex items-start gap-2 text-sm">
            <span
              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: row.fill }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="leading-snug text-foreground break-words">{row.label}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {row.count}
                {showPercent ? ` · ${pct}%` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SurveyQuestionChart({
  answerType,
  mcCounts,
  ratingCounts,
  options,
  ratingAvg,
  className,
}: SurveyQuestionChartProps) {
  const isChoice = isChoiceAnswerType(answerType);
  const isRating = answerType === 'rating';
  const isSingleChoice = answerType === 'multiple_choice';

  const rows = useMemo(() => {
    if (isChoice && mcCounts) return buildChoiceRows(mcCounts, options);
    if (isRating && ratingCounts) return buildRatingRows(ratingCounts);
    return [];
  }, [isChoice, isRating, mcCounts, ratingCounts, options]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.count, 0), [rows]);
  const pieEligible = isSingleChoice && rows.length >= 2 && rows.length <= 5 && total > 0;
  const [view, setView] = useState<'bar' | 'pie'>('bar');

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      count: { label: 'Count', color: BRAND },
    };
    for (const row of rows) {
      config[row.key] = { label: row.label, color: row.fill };
    }
    return config;
  }, [rows]);

  if (!isChoice && !isRating) return null;
  if (rows.length === 0 || total === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No responses to chart yet.
      </p>
    );
  }

  const activeView = pieEligible ? view : 'bar';
  const chartHeightClass =
    activeView === 'pie'
      ? 'aspect-square h-[220px] w-full max-w-[240px]'
      : isChoice
        ? cn('w-full', rows.length <= 3 ? 'h-[160px]' : rows.length <= 6 ? 'h-[220px]' : 'h-[280px]')
        : 'h-[200px] w-full';

  return (
    <div className={cn('max-w-2xl space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isRating && ratingAvg != null && (
            <span className="inline-flex items-center rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-foreground">
              Average <span className="ml-1 tabular-nums font-semibold">{ratingAvg.toFixed(2)}</span>
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {answerType === 'checkbox'
              ? 'Selection counts (multi-select)'
              : activeView === 'pie'
                ? 'Share of responses'
                : 'Response distribution'}
          </p>
        </div>
        {pieEligible && (
          <div className="flex rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={activeView === 'bar' ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setView('bar')}
            >
              Bar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={activeView === 'pie' ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              onClick={() => setView('pie')}
            >
              Pie
            </Button>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-center',
          activeView === 'pie' && 'sm:justify-start'
        )}
      >
        <ChartContainer
          config={chartConfig}
          className={cn(chartHeightClass, activeView !== 'pie' && 'sm:flex-1 sm:min-w-0')}
        >
          {activeView === 'pie' ? (
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="key"
                    formatter={(value, _name, item) => {
                      const label = (item?.payload as ChartRow | undefined)?.label ?? '';
                      const count = Number(value) || 0;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{label}</span>
                          <span className="text-muted-foreground">
                            {count} ({pct}%)
                          </span>
                        </div>
                      );
                    }}
                    hideLabel
                  />
                }
              />
              <Pie
                data={rows}
                dataKey="count"
                nameKey="key"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={78}
                paddingAngle={2}
              >
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="key" className="flex-wrap" />} />
            </PieChart>
          ) : isChoice ? (
            <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={96}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Count" maxBarSize={28}>
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
                <LabelList dataKey="count" position="right" className="fill-foreground text-[11px]" />
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={rows} margin={{ left: 4, right: 8, top: 16, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Count" maxBarSize={40}>
                {rows.map((row) => (
                  <Cell key={row.key} fill={row.fill} />
                ))}
                <LabelList dataKey="count" position="top" className="fill-foreground text-[11px]" />
              </Bar>
            </BarChart>
          )}
        </ChartContainer>

        {activeView !== 'pie' && (
          <div className="sm:w-44 sm:shrink-0 sm:border-l sm:pl-4">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Legend
            </p>
            <CountLegend rows={rows} total={total} showPercent={isSingleChoice || isRating} />
          </div>
        )}
      </div>
    </div>
  );
}
