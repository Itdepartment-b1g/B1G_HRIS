import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ExternalLink } from 'lucide-react';
import {
  DUE_META,
  STATUS_META,
  dueKey,
  formatDate,
  fullName,
  type EvaluationRow,
} from '@/lib/performance';

interface EvaluationTableProps {
  rows: EvaluationRow[];
  showEmployee?: boolean;
  onOpen: (row: EvaluationRow) => void;
  emptyText?: string;
}

function evaluatorLabel(row: EvaluationRow) {
  if (row.evaluators && row.evaluators.length > 0) {
    return row.evaluators.map((v) => fullName(v.evaluator)).join(', ');
  }
  return null;
}

function scoreLabel(row: EvaluationRow) {
  if (row.average_score == null) return '—';
  const score = Number(row.average_score).toFixed(1);
  return row.rating_label ? `${score} · ${row.rating_label}` : score;
}

export function EvaluationTable({ rows, showEmployee = true, onOpen, emptyText = 'No evaluations found' }: EvaluationTableProps) {
  if (rows.length === 0) {
    return <p className="text-center py-8 text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <>
      <div className="md:hidden space-y-3">
        {rows.map((r) => {
          const dk = dueKey(r);
          const dm = DUE_META[dk];
          const sm = STATUS_META[r.status];
          const evaluators = evaluatorLabel(r);
          return (
            <div key={r.id} className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {showEmployee && (
                    <>
                      <p className="font-medium leading-tight">{fullName(r.employee)}</p>
                      <p className="text-xs text-muted-foreground">{r.employee?.employee_code}</p>
                    </>
                  )}
                  <p className={showEmployee ? 'mt-2 font-medium leading-tight' : 'font-medium leading-tight'}>{r.period_label}</p>
                  <p className="text-xs text-muted-foreground">{r.template_name}</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => onOpen(r)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Open
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Due</dt>
                  <dd>{formatDate(r.due_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Score</dt>
                  <dd>{scoreLabel(r)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due state</dt>
                  <dd className="mt-1"><Badge variant="outline" className={dm.className}>{dm.label}</Badge></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-1"><Badge variant="outline" className={sm.className}>{sm.label}</Badge></dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Evaluators</dt>
                  <dd>{evaluators ?? <span className="text-amber-700 text-xs">Unassigned</span>}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="hidden md:block">
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Employee</TableHead>}
          <TableHead>Evaluation</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Due State</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Evaluators</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const dk = dueKey(r);
          const dm = DUE_META[dk];
          const sm = STATUS_META[r.status];
          const evaluators = evaluatorLabel(r);
          return (
            <TableRow key={r.id}>
              {showEmployee && (
                <TableCell className="text-sm">
                  <div className="font-medium">{fullName(r.employee)}</div>
                  <div className="text-xs text-muted-foreground">{r.employee?.employee_code}</div>
                </TableCell>
              )}
              <TableCell className="text-sm">
                <div className="font-medium">{r.period_label}</div>
                <div className="text-xs text-muted-foreground">{r.template_name}</div>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">{formatDate(r.due_date)}</TableCell>
              <TableCell>
                <Badge variant="outline" className={dm.className}>{dm.label}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={sm.className}>{sm.label}</Badge>
              </TableCell>
              <TableCell className="text-sm">
                {evaluators ?? <span className="text-amber-700 text-xs">Unassigned</span>}
              </TableCell>
              <TableCell className="text-sm">{scoreLabel(r)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(r)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Open
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
      </div>
    </>
  );
}
