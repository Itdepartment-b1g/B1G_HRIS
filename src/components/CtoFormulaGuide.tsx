import { OT_HOURS_PER_CTO_DAY, formatCtoFixed, formatOtHours } from '@/lib/ctoHistory';

interface CtoFormulaGuideProps {
  /** When set, also show this OT request's worked example. */
  otHours?: number | null;
  ctoCredited?: number | null;
  /** `compact` = worked example only (for accordion rows). */
  variant?: 'full' | 'compact';
}

/**
 * Shows HR's CTO conversion formula so viewers can see how credits are computed.
 */
export function CtoFormulaGuide({ otHours, ctoCredited, variant = 'full' }: CtoFormulaGuideProps) {
  const showWorkedExample = otHours != null && otHours > 0 && ctoCredited != null;

  if (variant === 'compact') {
    if (!showWorkedExample || otHours == null || ctoCredited == null) return null;
    return (
      <p className="font-mono text-sm rounded-md border bg-muted/40 px-3 py-2">
        {formatOtHours(otHours)} OT hours ÷ {OT_HOURS_PER_CTO_DAY} = {formatCtoFixed(ctoCredited)} CTO
      </p>
    );
  }

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-3 space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How CTO is computed</p>
        <p className="font-mono text-sm mt-1">
          CTO credited = Approved OT hours ÷ {OT_HOURS_PER_CTO_DAY}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <FormulaRow label="1 hour approved OT" value={`${formatCtoFixed(0.125)} CTO`} />
        <FormulaRow label="8 hours approved OT" value={`${formatCtoFixed(1)} CTO`} />
        <FormulaRow label="Full-day CTO leave" value="−1.000 CTO" />
        <FormulaRow label="First / second half CTO" value="−0.500 CTO" />
      </div>
    </div>
  );
}

function FormulaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-sm bg-background/80 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium shrink-0">{value}</span>
    </div>
  );
}
