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

export function EvaluationTable({ rows, showEmployee = true, onOpen, emptyText = 'No evaluations found' }: EvaluationTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Employee</TableHead>}
          <TableHead>Evaluation</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Due State</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Evaluators</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Open</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const dk = dueKey(r);
          const dm = DUE_META[dk];
          const sm = STATUS_META[r.status];
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
              <TableCell className="hidden md:table-cell text-sm">
                {r.evaluators && r.evaluators.length > 0
                  ? r.evaluators.map((v) => fullName(v.evaluator)).join(', ')
                  : <span className="text-amber-700 text-xs">Unassigned</span>}
              </TableCell>
              <TableCell className="text-sm">
                {r.average_score != null ? (
                  <span>
                    <span className="font-semibold">{Number(r.average_score).toFixed(1)}</span>
                    {r.rating_label && <span className="text-muted-foreground"> · {r.rating_label}</span>}
                  </span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(r)}>
                  <ExternalLink className="h-4 w-4 mr-1" /> Open
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={showEmployee ? 8 : 7} className="text-center py-8 text-muted-foreground">
              {emptyText}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
