import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCheck, Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EvaluationTable } from '@/components/performance/EvaluationTable';
import { CreateEvaluationDialog } from '@/components/performance/CreateEvaluationDialog';
import { TemplatesPanel } from '@/components/performance/TemplatesPanel';
import {
  DUE_META,
  DUE_ORDER,
  EVALUATION_SELECT,
  dueKey,
  isAdminRole,
  type DueKey,
  type EvaluationRow,
  type FormTemplate,
} from '@/lib/performance';
import { errorMessage } from '@/lib/performanceData';

const Performance = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const admin = isAdminRole(user?.roles);
  const rawTab = searchParams.get('tab') ?? 'mine';
  const requestedTab = ['mine', 'evaluate', 'hr', 'all', 'templates'].includes(rawTab) ? rawTab : 'mine';
  const tab = user && (requestedTab === 'templates' || requestedTab === 'all') && !admin ? 'mine' : requestedTab;
  const setTab = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'mine') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHrDepartment, setIsHrDepartment] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<DueKey | 'all'>('all');

  // RLS already limits rows to what this user may see (own, evaluator, HR signer, or all for admin)
  const loadEvaluations = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('performance_evaluations')
      .select(EVALUATION_SELECT)
      .order('due_date', { ascending: true });
    if (error) toast.error(errorMessage(error, 'Failed to load evaluations'));
    else setRows((data ?? []) as unknown as EvaluationRow[]);
    setLoading(false);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('performance_form_templates')
      .select('*')
      .order('name');
    if (error) toast.error(errorMessage(error, 'Failed to load forms'));
    else setTemplates((data ?? []) as unknown as FormTemplate[]);
  }, []);

  useEffect(() => { loadEvaluations(); }, [loadEvaluations]);

  useEffect(() => {
    if (admin) loadTemplates();
  }, [admin, loadTemplates]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data: settings } = await supabase
        .from('performance_settings')
        .select('hr_department_id')
        .eq('id', 1)
        .maybeSingle();
      const hrId = settings?.hr_department_id;
      if (!hrId) {
        if (!cancelled) setIsHrDepartment(false);
        return;
      }
      const { data: membership } = await supabase
        .from('employee_departments')
        .select('employee_id')
        .eq('employee_id', user.id)
        .eq('department_id', hrId);
      if (!cancelled) setIsHrDepartment((membership?.length ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const myId = user?.id ?? '';
  const mine = useMemo(() => rows.filter((r) => r.employee_id === myId), [rows, myId]);
  const toEvaluate = useMemo(
    () => rows.filter((r) => r.evaluators?.some((v) => v.evaluator_id === myId)),
    [rows, myId]
  );
  const hrQueue = useMemo(
    () => rows.filter((r) => r.hr_signers?.some((s) => s.hr_signer_id === myId)),
    [rows, myId]
  );
  const showHrTab = admin || isHrDepartment || hrQueue.length > 0;

  const counts = useMemo(() => {
    const base = Object.fromEntries(DUE_ORDER.map((k) => [k, 0])) as Record<DueKey, number>;
    for (const r of rows) base[dueKey(r)] += 1;
    return base;
  }, [rows]);

  const allFiltered = useMemo(
    () => (stateFilter === 'all' ? rows : rows.filter((r) => dueKey(r) === stateFilter)),
    [rows, stateFilter]
  );

  const openEvaluation = (r: EvaluationRow) => navigate(`/dashboard/performance/evaluations/${r.id}`);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" /> Performance Evaluation
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Probation evaluations (3rd and 5th month), evaluator sign-off, employee acknowledgement, and HR signature.
          </p>
        </div>
        {admin && tab !== 'templates' && (
          <Button onClick={() => setCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-white">
            <Plus className="h-4 w-4 mr-2" /> Create Evaluation
          </Button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="mine">My Evaluations ({mine.length})</TabsTrigger>
            <TabsTrigger value="evaluate">To Evaluate ({toEvaluate.length})</TabsTrigger>
            {showHrTab && <TabsTrigger value="hr">HR Signing ({hrQueue.length})</TabsTrigger>}
            {admin && <TabsTrigger value="all">All Evaluations ({rows.length})</TabsTrigger>}
            {admin && <TabsTrigger value="templates">Forms & Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="mine">
            <Card>
              <CardHeader><CardTitle className="text-base">My evaluations</CardTitle></CardHeader>
              <CardContent>
                <EvaluationTable
                  rows={mine}
                  showEmployee={false}
                  onOpen={openEvaluation}
                  emptyText="You have no performance evaluations."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evaluate">
            <Card>
              <CardHeader><CardTitle className="text-base">Evaluations assigned to me</CardTitle></CardHeader>
              <CardContent>
                <EvaluationTable
                  rows={toEvaluate}
                  onOpen={openEvaluation}
                  emptyText="No evaluations are assigned to you."
                />
              </CardContent>
            </Card>
          </TabsContent>

          {showHrTab && (
            <TabsContent value="hr">
              <Card>
                <CardHeader><CardTitle className="text-base">Waiting for my HR signature</CardTitle></CardHeader>
                <CardContent>
                  <EvaluationTable
                    rows={hrQueue}
                    onOpen={openEvaluation}
                    emptyText="No evaluations are waiting for your HR signature."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {admin && (
            <TabsContent value="all" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                {DUE_ORDER.map((k) => {
                  const meta = DUE_META[k];
                  const active = stateFilter === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStateFilter(active ? 'all' : k)}
                      className={`text-left rounded-md border p-3 transition ${active ? 'ring-2 ring-primary' : 'hover:bg-muted/40'}`}
                    >
                      <div className="text-xs text-muted-foreground">{meta.label}</div>
                      <div className="text-2xl font-bold">{counts[k]}</div>
                    </button>
                  );
                })}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {stateFilter === 'all' ? 'All evaluations' : `${DUE_META[stateFilter].label} evaluations`} ({allFiltered.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EvaluationTable rows={allFiltered} onOpen={openEvaluation} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {admin && (
            <TabsContent value="templates">
              <TemplatesPanel templates={templates} userId={user?.id ?? null} onChanged={() => { loadTemplates(); loadEvaluations(); }} />
            </TabsContent>
          )}
        </Tabs>
      )}

      {admin && (
        <CreateEvaluationDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          templates={templates}
          onCreated={loadEvaluations}
        />
      )}
    </div>
  );
};

export default Performance;
