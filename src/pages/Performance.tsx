import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BellRing,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  Loader2,
  PenLine,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Stamp,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { EvaluationTable } from '@/components/performance/EvaluationTable';
import { CreateEvaluationDialog } from '@/components/performance/CreateEvaluationDialog';
import { TemplatesPanel } from '@/components/performance/TemplatesPanel';
import {
  DUE_META,
  DUE_ORDER,
  EVALUATION_SELECT,
  STATUS_META,
  dueKey,
  fullName,
  isAdminRole,
  type DueKey,
  type EvaluationRow,
  type FormTemplate,
} from '@/lib/performance';
import { errorMessage } from '@/lib/performanceData';

function evaluationSearchText(row: EvaluationRow): string {
  return [
    fullName(row.employee),
    row.employee?.employee_code,
    row.template_name,
    row.period_label,
    row.rating_label,
    STATUS_META[row.status]?.label,
    DUE_META[dueKey(row)]?.label,
    ...(row.evaluators ?? []).map((v) => fullName(v.evaluator)),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const DUE_CARD_STYLE: Record<DueKey, { icon: LucideIcon; iconClass: string; glowClass: string }> = {
  overdue: { icon: TriangleAlert, iconClass: 'bg-red-500/15 text-red-600', glowClass: 'bg-red-400/40' },
  due: { icon: BellRing, iconClass: 'bg-amber-500/15 text-amber-600', glowClass: 'bg-amber-400/40' },
  upcoming: { icon: CalendarClock, iconClass: 'bg-sky-500/15 text-sky-600', glowClass: 'bg-sky-400/40' },
  not_yet_due: { icon: CalendarDays, iconClass: 'bg-slate-500/15 text-slate-600', glowClass: 'bg-slate-400/40' },
  awaiting: { icon: Stamp, iconClass: 'bg-violet-500/15 text-violet-600', glowClass: 'bg-violet-400/40' },
  completed: { icon: CircleCheck, iconClass: 'bg-emerald-500/15 text-emerald-600', glowClass: 'bg-emerald-400/40' },
  cancelled: { icon: CircleX, iconClass: 'bg-gray-500/15 text-gray-500', glowClass: 'bg-gray-400/40' },
};

type SectionId = 'mine' | 'evaluate' | 'hr' | 'all' | 'templates';

const SECTION_IDS: SectionId[] = ['mine', 'evaluate', 'hr', 'all', 'templates'];

const Performance = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useCurrentUser();
  const admin = isAdminRole(user?.roles);
  const rawSection = searchParams.get('tab') ?? 'mine';
  const requested = SECTION_IDS.includes(rawSection as SectionId) ? (rawSection as SectionId) : 'mine';
  const section: SectionId =
    user && (requested === 'templates' || requested === 'all') && !admin ? 'mine' : requested;
  const setSection = (value: SectionId) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'mine') next.delete('tab');
    else next.set('tab', value);
    setStateFilter('all');
    setSearchParams(next, { replace: true });
  };

  const [rows, setRows] = useState<EvaluationRow[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHrDepartment, setIsHrDepartment] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [stateFilter, setStateFilter] = useState<DueKey | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

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
  const showHr = admin || isHrDepartment || hrQueue.length > 0;

  const sections = useMemo(() => {
    const items: { id: SectionId; label: string; description: string; count: number; icon: typeof User }[] = [
      { id: 'mine', label: 'My Evaluations', description: 'Evaluations about me', count: mine.length, icon: User },
      { id: 'evaluate', label: 'To Evaluate', description: 'Waiting for my score', count: toEvaluate.length, icon: PenLine },
    ];
    if (showHr) {
      items.push({ id: 'hr', label: 'HR Signing', description: 'Waiting for my HR signature', count: hrQueue.length, icon: ShieldCheck });
    }
    if (admin) {
      items.push(
        { id: 'all', label: 'All Evaluations', description: 'Every evaluation', count: rows.length, icon: ClipboardList },
        { id: 'templates', label: 'Forms & Settings', description: 'Forms and who can sign', count: templates.length, icon: Settings2 },
      );
    }
    return items;
  }, [admin, showHr, mine.length, toEvaluate.length, hrQueue.length, rows.length, templates.length]);

  const currentRows = section === 'mine' ? mine : section === 'evaluate' ? toEvaluate : section === 'hr' ? hrQueue : rows;
  const counts = useMemo(() => {
    const base = Object.fromEntries(DUE_ORDER.map((k) => [k, 0])) as Record<DueKey, number>;
    for (const r of currentRows) base[dueKey(r)] += 1;
    return base;
  }, [currentRows]);
  const stateRows = stateFilter === 'all' ? currentRows : currentRows.filter((r) => dueKey(r) === stateFilter);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stateRows;
    return stateRows.filter((r) => evaluationSearchText(r).includes(query));
  }, [stateRows, search]);
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visibleRows.slice(start, start + pageSize);
  }, [visibleRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [section, stateFilter, search, pageSize]);

  const sectionMeta = sections.find((s) => s.id === section) ?? sections[0];
  const openEvaluation = (r: EvaluationRow) => navigate(`/dashboard/performance/evaluations/${r.id}`);
  const panelTitle = sectionMeta?.label ?? 'Evaluations';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">Performance Evaluation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review evaluations, score your team, and sign as HR.
        </p>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 mt-4">
        <aside className="hidden lg:flex flex-col w-64 shrink-0 pr-1">
          <div className="flex items-center gap-3 px-4 py-4 mb-3 rounded-xl bg-primary/5 border border-primary/10">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm leading-tight">Performance</p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">Choose a list</p>
            </div>
          </div>
          <nav className="flex flex-col gap-0.5">
            {sections.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group w-full',
                    active ? 'bg-primary/10 text-primary font-medium' : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                  )}
                >
                  <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', active ? 'bg-primary/15' : 'bg-muted')}>
                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">{item.description}</p>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span>
                  <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'opacity-60' : 'opacity-0 group-hover:opacity-30')} />
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
          <div className="lg:hidden shrink-0 flex gap-2 overflow-x-auto overflow-y-hidden pb-1">
            {sections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium shrink-0',
                  section === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {item.label} ({item.count})
              </button>
            ))}
          </div>

          {section !== 'templates' && (
            <div className="shrink-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {DUE_ORDER.map((key) => {
                  const meta = DUE_META[key];
                  const style = DUE_CARD_STYLE[key];
                  const Icon = style.icon;
                  return (
                    <div
                      key={key}
                      className="relative overflow-hidden rounded-xl border border-white/60 bg-white/60 dark:bg-card/60 backdrop-blur-md shadow-md shadow-slate-900/10 px-4 py-3.5 flex items-center gap-3"
                    >
                      <span
                        aria-hidden
                        className={cn('pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl', style.glowClass)}
                      />
                      <div className={cn('relative h-10 w-10 rounded-lg flex items-center justify-center shrink-0', style.iconClass)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="relative min-w-0">
                        <p className="text-xs text-muted-foreground truncate">{meta.label}</p>
                        <p className="text-2xl font-bold tabular-nums leading-tight">{counts[key]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : section === 'templates' && admin ? (
            <TemplatesPanel templates={templates} userId={user?.id ?? null} onChanged={() => { loadTemplates(); loadEvaluations(); }} />
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {panelTitle} ({visibleRows.length})
                </CardTitle>
                {admin && (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Create Evaluation
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, code, form, or period..."
                      className="pl-10"
                    />
                  </div>
                  <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as DueKey | 'all')}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {DUE_ORDER.map((k) => (
                        <SelectItem key={k} value={k}>{DUE_META[k].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <EvaluationTable
                  rows={pagedRows}
                  showEmployee={section !== 'mine'}
                  onOpen={openEvaluation}
                  emptyText={
                    search.trim()
                      ? 'No evaluations match your search.'
                      : section === 'mine'
                        ? 'You have no performance evaluations.'
                        : section === 'evaluate'
                          ? 'No evaluations are assigned to you.'
                          : section === 'hr'
                            ? 'No evaluations are waiting for your HR signature.'
                            : 'No evaluations found.'
                  }
                />
                <TablePagination
                  totalItems={visibleRows.length}
                  currentPage={page}
                  onPageChange={setPage}
                  pageSize={pageSize}
                  onPageSizeChange={setPageSize}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

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
