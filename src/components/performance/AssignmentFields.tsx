import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { PersonOption } from '@/lib/performanceData';

interface AssignmentFieldsProps {
  /** When false, the evaluator list is hidden and `evaluatorNote` is shown instead. */
  showEvaluators?: boolean;
  evaluatorNote?: string;
  evaluatorOptions: PersonOption[];
  evaluatorIds: string[];
  onEvaluatorIdsChange: (ids: string[]) => void;
  evaluatorsLocked?: boolean;
  hrOptions: PersonOption[];
  hrSignerIds: string[];
  onHrSignerIdsChange: (ids: string[]) => void;
  hrConfigured: boolean;
  hrLocked?: boolean;
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Pick evaluators (immediate superiors) and HR signers (Human Resources department, any one may sign). */
export function AssignmentFields({
  showEvaluators = true,
  evaluatorNote,
  evaluatorOptions,
  evaluatorIds,
  onEvaluatorIdsChange,
  evaluatorsLocked,
  hrOptions,
  hrSignerIds,
  onHrSignerIdsChange,
  hrConfigured,
  hrLocked,
}: AssignmentFieldsProps) {
  return (
    <div className="space-y-4">
      {showEvaluators ? (
        <div className="space-y-2">
          <Label>
            Evaluators <span className="text-xs text-muted-foreground">(immediate superiors, one or more)</span>
          </Label>
          <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
            {evaluatorOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active immediate superior is assigned to this employee yet.
              </p>
            ) : (
              evaluatorOptions.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
                >
                  <Checkbox
                    checked={evaluatorIds.includes(o.id)}
                    disabled={evaluatorsLocked}
                    onCheckedChange={() => onEvaluatorIdsChange(toggleId(evaluatorIds, o.id))}
                  />
                  <span className="text-sm">{o.name}</span>
                </label>
              ))
            )}
          </div>
          {evaluatorIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{evaluatorIds.length} selected</p>
          )}
        </div>
      ) : (
        evaluatorNote && <p className="text-sm text-muted-foreground border rounded-md p-3">{evaluatorNote}</p>
      )}

      <div className="space-y-2">
        <Label>
          HR Signers <span className="text-xs text-muted-foreground">(Human Resources department, any one selected person can sign)</span>
        </Label>
        {!hrConfigured ? (
          <p className="text-xs text-amber-700">
            Set who can sign as HR in the Performance settings (Forms &amp; Settings tab) first.
          </p>
        ) : hrOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active employees in the Human Resources department.</p>
        ) : (
          <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
            {hrOptions.map((o) => (
              <label
                key={o.id}
                className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1"
              >
                <Checkbox
                  checked={hrSignerIds.includes(o.id)}
                  disabled={hrLocked}
                  onCheckedChange={() => onHrSignerIdsChange(toggleId(hrSignerIds, o.id))}
                />
                <span className="text-sm">{o.name}</span>
              </label>
            ))}
          </div>
        )}
        {hrConfigured && hrSignerIds.length > 0 && (
          <p className="text-xs text-muted-foreground">{hrSignerIds.length} selected</p>
        )}
      </div>
    </div>
  );
}
