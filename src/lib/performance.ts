// Performance Evaluation module: shared types, defaults, and display helpers.
// Server (supabase-migration-performance-evaluation.sql) is authoritative for
// scoring and status changes. Client math here is only for live preview.

export type PerformanceStatus = 'scheduled' | 'submitted' | 'acknowledged' | 'hr_signed' | 'cancelled';
export type ScheduleType = 'hired_offset' | 'monthly' | 'manual';

export interface RatingScaleItem {
  value: number;
  label: string;
}

export interface FactorDef {
  id: string;
  title: string;
  description: string;
  required: boolean;
  include_in_average: boolean;
  has_comment: boolean;
}

export interface SectionDef {
  id: string;
  title: string;
  required: boolean;
}

export interface RatingBand {
  min: number;
  label: string;
}

export interface ScheduleConfig {
  months_after_hire?: number[];
  day_of_month?: number;
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string | null;
  applies_to_status_ids: string[];
  schedule_type: ScheduleType;
  schedule_config: ScheduleConfig;
  rating_scale: RatingScaleItem[];
  factors: FactorDef[];
  sections: SectionDef[];
  rating_bands: RatingBand[];
  recommendation_options: string[];
  recommendation_required: boolean;
  version: number;
  is_active: boolean;
  auto_create: boolean;
  created_at: string;
}

export interface EmployeeSnapshot {
  employee_code: string;
  full_name: string;
  position: string | null;
  department: string | null;
  employment_status: string | null;
  date_hired: string | null;
}

export interface FormSnapshot {
  employee: EmployeeSnapshot;
  rating_scale: RatingScaleItem[];
  factors: FactorDef[];
  sections: SectionDef[];
  rating_bands: RatingBand[];
  recommendation_options: string[];
  recommendation_required: boolean;
}

export interface FactorRating {
  rating: number | null;
  comment: string;
}

export interface PersonName {
  first_name: string;
  last_name: string;
}

export interface EvaluationRow {
  id: string;
  template_id: string | null;
  template_name: string;
  template_version: number;
  employee_id: string;
  period_label: string;
  period_from: string | null;
  period_to: string | null;
  due_date: string;
  status: PerformanceStatus;
  form_snapshot: FormSnapshot;
  ratings: Record<string, FactorRating>;
  section_values: Record<string, string>;
  recommendation: string | null;
  average_score: number | null;
  rating_label: string | null;
  date_of_evaluation: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  evaluator_signature: string | null;
  employee_comment: string | null;
  acknowledged_at: string | null;
  hr_signed_by: string | null;
  hr_signed_at: string | null;
  hr_signature: string | null;
  hr_comment: string | null;
  ack_skipped_reason: string | null;
  reopen_count: number;
  cancel_reason: string | null;
  created_at: string;
  employee?: (PersonName & { employee_code: string }) | null;
  submitted?: PersonName | null;
  hr_signed?: PersonName | null;
  hr_signers?: { hr_signer_id: string; hr_signer?: PersonName | null }[];
  evaluators?: { evaluator_id: string; evaluator?: PersonName | null }[];
}

export interface EvaluationEvent {
  id: string;
  evaluation_id: string;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor?: PersonName | null;
}

export const EVALUATION_SELECT =
  '*, employee:employees!employee_id(first_name, last_name, employee_code), submitted:employees!submitted_by(first_name, last_name), hr_signed:employees!hr_signed_by(first_name, last_name), hr_signers:performance_hr_signers(hr_signer_id, hr_signer:employees!hr_signer_id(first_name, last_name)), evaluators:performance_evaluators(evaluator_id, evaluator:employees!evaluator_id(first_name, last_name))';

// ---------- Defaults (from HR's printed sheet) ----------

export const DEFAULT_RATING_SCALE: RatingScaleItem[] = [
  { value: 5, label: 'Excellent' },
  { value: 4, label: 'Very Good' },
  { value: 3, label: 'Satisfactory' },
  { value: 2, label: 'Needs Improvement' },
  { value: 1, label: 'Unsatisfactory' },
];

export const DEFAULT_FACTORS: FactorDef[] = [
  { id: 'job_knowledge', title: 'Job Knowledge & Skills', description: 'Demonstrates knowledge and competence in job duties.', required: true, include_in_average: true, has_comment: true },
  { id: 'quality_of_work', title: 'Quality of Work', description: 'Accuracy, thoroughness, and attention to detail.', required: true, include_in_average: true, has_comment: true },
  { id: 'productivity', title: 'Productivity & Efficiency', description: 'Completes tasks on time; manages workload well.', required: true, include_in_average: true, has_comment: true },
  { id: 'communication', title: 'Communication Skills', description: 'Clear, respectful, and effective in oral/written communication.', required: true, include_in_average: true, has_comment: true },
  { id: 'teamwork', title: 'Teamwork & Collaboration', description: 'Cooperates with colleagues; contributes to group success.', required: true, include_in_average: true, has_comment: true },
  { id: 'initiative', title: 'Initiative & Problem-Solving', description: 'Shows resourcefulness and willingness to take on new challenges.', required: true, include_in_average: true, has_comment: true },
  { id: 'dependability', title: 'Dependability & Attendance', description: 'Reliability, punctuality, and consistency.', required: true, include_in_average: true, has_comment: true },
  { id: 'adaptability', title: 'Adaptability & Flexibility', description: 'Adjusts to changes and handles pressure effectively.', required: true, include_in_average: true, has_comment: true },
  { id: 'professionalism', title: 'Professionalism & Responsiveness', description: 'Professionalism and responsiveness to clients/customers.', required: true, include_in_average: true, has_comment: true },
  { id: 'leadership', title: 'Leadership (if applicable)', description: 'Ability to guide, motivate, and manage others.', required: false, include_in_average: true, has_comment: true },
];

export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: 'strengths', title: 'Strengths (key strengths observed during the evaluation period)', required: true },
  { id: 'areas_for_improvement', title: 'Areas for Improvement (areas where development or training is needed)', required: true },
];

export const DEFAULT_RATING_BANDS: RatingBand[] = [
  { min: 4.5, label: 'Excellent' },
  { min: 3.5, label: 'Very Good' },
  { min: 2.5, label: 'Satisfactory' },
  { min: 1.5, label: 'Needs Improvement' },
  { min: 1.0, label: 'Unsatisfactory' },
];

export const ACKNOWLEDGEMENT_TEXT = 'I acknowledge that I have received and reviewed this performance evaluation.';

// ---------- Math (preview only; server recalculates on submit) ----------

/** Average of rated factors that count toward the average, rounded half-up to 1 decimal. */
export function computeAverage(
  factors: FactorDef[],
  ratings: Record<string, FactorRating>
): { average: number | null; ratedCount: number } {
  let sum = 0;
  let count = 0;
  for (const f of factors) {
    const r = ratings[f.id]?.rating;
    if (r == null) continue;
    if (!f.include_in_average) continue;
    sum += r;
    count += 1;
  }
  if (count === 0) return { average: null, ratedCount: 0 };
  return { average: Math.floor((sum * 10) / count + 0.5) / 10, ratedCount: count };
}

export function bandLabel(average: number | null, bands: RatingBand[]): string | null {
  if (average == null) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => average >= b.min)?.label ?? null;
}

// ---------- Due state (HR dashboard wording) ----------

export type DueKey = 'not_yet_due' | 'upcoming' | 'due' | 'overdue' | 'awaiting' | 'completed' | 'cancelled';

export const DUE_META: Record<DueKey, { label: string; className: string }> = {
  not_yet_due: { label: 'Not Yet Due', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  upcoming: { label: 'Upcoming', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  due: { label: 'Due', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: 'Overdue', className: 'bg-red-50 text-red-700 border-red-200' },
  awaiting: { label: 'Awaiting Sign-off', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export const DUE_ORDER: DueKey[] = ['overdue', 'due', 'upcoming', 'not_yet_due', 'awaiting', 'completed', 'cancelled'];

export function todayManila(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function toUtcDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Whole days from `fromIso` to `toIso` (YYYY-MM-DD). */
function dayDiff(fromIso: string, toIso: string): number {
  return Math.round(toUtcDay(toIso) - toUtcDay(fromIso));
}

export function dueKey(ev: Pick<EvaluationRow, 'status' | 'due_date'>, today: string = todayManila()): DueKey {
  if (ev.status === 'cancelled') return 'cancelled';
  if (ev.status === 'hr_signed') return 'completed';
  if (ev.status === 'submitted' || ev.status === 'acknowledged') return 'awaiting';
  const diff = dayDiff(today, ev.due_date); // due_date - today
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due';
  if (diff <= 7) return 'upcoming';
  return 'not_yet_due';
}

export const STATUS_META: Record<PerformanceStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  submitted: { label: 'Submitted', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  acknowledged: { label: 'Acknowledged', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  hr_signed: { label: 'HR Signed', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export const SCHEDULE_LABEL: Record<ScheduleType, string> = {
  hired_offset: 'Months after hire',
  monthly: 'Monthly',
  manual: 'Manual',
};

export function scheduleSummary(t: Pick<FormTemplate, 'schedule_type' | 'schedule_config'>): string {
  if (t.schedule_type === 'hired_offset') {
    const months = t.schedule_config.months_after_hire ?? [];
    return months.length ? `Hire date + ${months.join(', ')} month(s)` : 'Months after hire (none set)';
  }
  if (t.schedule_type === 'monthly') return `Every month, day ${t.schedule_config.day_of_month ?? 25}`;
  return 'Manual (HR sets due date)';
}

export function fullName(p?: PersonName | null): string {
  if (!p) return '—';
  return `${p.first_name} ${p.last_name}`.trim();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const datePart = iso.length > 10 ? iso : `${iso}T00:00:00`;
  const d = new Date(datePart);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function isAdminRole(roles?: string[] | null): boolean {
  return !!roles?.some((r) => r === 'admin' || r === 'super_admin');
}

export const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  assignments_updated: 'Assignments updated',
  submitted: 'Submitted by evaluator',
  acknowledged: 'Acknowledged by employee',
  hr_signed: 'Signed by HR',
  cancelled: 'Cancelled',
  reopened: 'Reopened',
};
