import { format, parseISO } from 'date-fns';
import { flushClearanceEmails } from '@/lib/edgeFunctions';
import { supabase } from '@/lib/supabase';

export type ClearanceStatus = 'in_progress' | 'cleared' | 'cancelled';
export type SectionKind = 'immediate_superior' | 'department';

export interface PersonRef {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ClearanceItem {
  id: string;
  label: string;
  sort_order: number;
  remarks: string | null;
  deduction: string | null;
  signature_data: string | null;
  signed_by: string | null;
  signed_name: string | null;
  cleared_on: string | null;
  added_during_case: boolean;
}

export interface ClearanceDepartment {
  id: string;
  name: string;
  head_id: string | null;
  head: PersonRef | null;
}

export interface ClearanceSection {
  id: string;
  section_kind: SectionKind;
  department_id: string | null;
  title: string;
  assignee_id: string | null;
  /** Person chosen for this clearance only, when the usual signer is unavailable. */
  signer_override_id: string | null;
  sort_order: number;
  assignee: PersonRef | null;
  signer_override: PersonRef | null;
  department: ClearanceDepartment | null;
  items: ClearanceItem[];
}

export interface ClearanceEmployee {
  id: string;
  supervisor_id: string | null;
  is_active?: boolean;
  supervisor: PersonRef | null;
  /** Current immediate superiors: supervisor_id plus employee_supervisors. */
  supervisor_ids: string[];
  supervisors: PersonRef[];
}

export interface ClearanceRecord {
  id: string;
  employee_id: string;
  resignation_submitted_on: string;
  last_working_day: string;
  acceptance_date: string;
  reason: string | null;
  daily_monthly_rate: string | null;
  gross_pay: string | null;
  status: ClearanceStatus;
  employee_code: string | null;
  employee_name: string;
  position_name: string | null;
  hired_date: string | null;
  department_name: string | null;
  employment_status: string | null;
  immediate_head_id: string | null;
  immediate_head_name: string | null;
  company_name: string | null;
  heads_notified_at: string | null;
  completed_at: string | null;
  cancel_note: string | null;
  created_at: string;
  employee: ClearanceEmployee | null;
  sections: ClearanceSection[];
}

export interface TemplateItem {
  id: string;
  label: string;
  sort_order: number;
}

export interface TemplateSection {
  id: string;
  section_kind: SectionKind;
  department_id: string | null;
  title: string;
  sort_order: number;
  department: ClearanceDepartment | null;
  items: TemplateItem[];
}

export const CLEARANCE_NOTICES = [
  'NO CLEARANCE — NO RELEASE OF FULL AND FINAL PAY.',
  'Processing of clearance must be completed within 5 days from the last day of work.',
  'Accounting releases the final pay, in cash or cheque, together with the Quitclaim and Release Waiver, only after this clearance is complete.',
];

export const CLEARANCE_INSTRUCTIONS =
  'Sign each item only after it has been turned over. Do not sign until all accountabilities for your area have been returned.';

const LIST_SELECT = `
  id, employee_id, employee_name, employee_code, position_name, department_name,
  resignation_submitted_on, last_working_day, acceptance_date, status,
  heads_notified_at, created_at, immediate_head_name, company_name,
  reason, daily_monthly_rate, gross_pay, employment_status, hired_date,
  immediate_head_id, completed_at, cancel_note,
  employee:employees!employee_id(
    id, supervisor_id,
    employee_supervisors!employee_supervisors_employee_id_fkey(supervisor_id)
  ),
  clearance_sections(
    id, title, section_kind, assignee_id, signer_override_id, sort_order, department_id,
    department:departments(id, name, head_id),
    clearance_items(id, label, sort_order, cleared_on, signed_by, signed_name, remarks, deduction, added_during_case)
  )
`;

const DETAIL_SELECT = `
  id, employee_id, resignation_submitted_on, last_working_day, acceptance_date,
  reason, daily_monthly_rate, gross_pay, status, employee_code, employee_name,
  position_name, hired_date, department_name, employment_status,
  immediate_head_id, immediate_head_name, company_name, heads_notified_at,
  completed_at, cancel_note, created_at,
  employee:employees!employee_id(
    id, supervisor_id, is_active,
    supervisor:employees!supervisor_id(id, first_name, last_name),
    employee_supervisors!employee_supervisors_employee_id_fkey(
      supervisor_id,
      supervisor:employees!employee_supervisors_supervisor_id_fkey(id, first_name, last_name)
    )
  ),
  clearance_sections(
    id, section_kind, department_id, title, assignee_id, signer_override_id, sort_order,
    assignee:employees!assignee_id(id, first_name, last_name),
    signer_override:employees!signer_override_id(id, first_name, last_name),
    department:departments(
      id, name, head_id,
      head:employees!head_id(id, first_name, last_name)
    ),
    clearance_items(
      id, label, sort_order, remarks, deduction, signature_data,
      signed_by, signed_name, cleared_on, added_during_case
    )
  )
`;

const TEMPLATE_SELECT = `
  id, section_kind, department_id, title, sort_order,
  department:departments(
    id, name, head_id,
    head:employees!head_id(id, first_name, last_name)
  ),
  items:clearance_template_items(id, label, sort_order)
`;

interface DbError {
  message?: string;
  code?: string;
}

export function isHrAdmin(roles: string[] | undefined): boolean {
  return !!roles?.some((role) => role === 'admin' || role === 'super_admin');
}

export function personName(person: PersonRef | null | undefined): string {
  if (!person) return '';
  return `${person.first_name} ${person.last_name}`.trim();
}

export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function formatClearanceDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    const date = value.length <= 10 ? parseISO(value) : new Date(value);
    return format(date, 'MMMM d, yyyy');
  } catch {
    return value;
  }
}

export function dbMessage(error: DbError | null | undefined, fallback: string): string {
  const message = error?.message ?? '';
  if (/signer_override|clearance_set_section_signer|clearance_section_signer_options/i.test(message)) {
    return 'Run supabase-migration-exit-clearance-signer.sql in the Supabase SQL editor, then refresh.';
  }
  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST205' ||
    /does not exist|schema cache|could not find the function/i.test(message)
  ) {
    return 'Exit clearance is not in the database yet. Run supabase-migration-exit-clearance.sql in the Supabase SQL editor, then refresh.';
  }
  return message || fallback;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function normalizeDepartment(value: unknown): ClearanceDepartment | null {
  const department = asOne(value as ClearanceDepartment | ClearanceDepartment[] | null);
  if (!department) return null;
  return { ...department, head: asOne(department.head) };
}

function normalizeItem(raw: Partial<ClearanceItem> & { id: string }): ClearanceItem {
  return {
    id: raw.id,
    label: raw.label ?? '',
    sort_order: raw.sort_order ?? 0,
    remarks: raw.remarks ?? null,
    deduction: raw.deduction ?? null,
    signature_data: raw.signature_data ?? null,
    signed_by: raw.signed_by ?? null,
    signed_name: raw.signed_name ?? null,
    cleared_on: raw.cleared_on ?? null,
    added_during_case: raw.added_during_case ?? false,
  };
}

function supervisorIdsOf(employee: ClearanceEmployee & { employee_supervisors?: { supervisor_id?: string; supervisor?: PersonRef | PersonRef[] | null }[] }): string[] {
  const ids = new Set<string>();
  if (employee.supervisor_id) ids.add(employee.supervisor_id);
  for (const link of asArray(employee.employee_supervisors)) {
    if (link.supervisor_id) ids.add(link.supervisor_id);
  }
  return [...ids];
}

function supervisorsOf(employee: ClearanceEmployee & { employee_supervisors?: { supervisor_id?: string; supervisor?: PersonRef | PersonRef[] | null }[] }): PersonRef[] {
  const people = new Map<string, PersonRef>();
  if (employee.supervisor) people.set(employee.supervisor.id, employee.supervisor);
  for (const link of asArray(employee.employee_supervisors)) {
    const person = asOne(link.supervisor);
    if (person) people.set(person.id, person);
  }
  return [...people.values()];
}

export function normalizeClearance(row: Record<string, unknown>): ClearanceRecord {
  const employee = asOne(row.employee as ClearanceEmployee | ClearanceEmployee[] | null);
  const sections = asArray(row.clearance_sections as ClearanceSection[]).map((section) => ({
    ...section,
    assignee: asOne(section.assignee),
    signer_override: asOne(section.signer_override),
    signer_override_id: section.signer_override_id ?? null,
    department: normalizeDepartment(section.department),
    items: asArray(section.items ?? (section as { clearance_items?: ClearanceItem[] }).clearance_items)
      .map((item) => normalizeItem(item))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
  }));
  sections.sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

  return {
    ...(row as unknown as ClearanceRecord),
    employee: employee
      ? {
          ...employee,
          supervisor: asOne(employee.supervisor),
          supervisor_ids: supervisorIdsOf(employee),
          supervisors: supervisorsOf({ ...employee, supervisor: asOne(employee.supervisor) }),
        }
      : null,
    sections,
  };
}

export function normalizeTemplate(row: Record<string, unknown>): TemplateSection {
  const items = asArray(
    (row.items ?? (row as { clearance_template_items?: TemplateItem[] }).clearance_template_items) as TemplateItem[]
  ).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  return {
    ...(row as unknown as TemplateSection),
    department: normalizeDepartment(row.department),
    items,
  };
}

export function clearanceProgress(sections: ClearanceSection[]) {
  const tracked = sections.filter((section) => section.items.length > 0);
  const cleared = tracked.filter((section) => section.items.every((item) => item.cleared_on)).length;
  const pendingTitles = tracked
    .filter((section) => section.items.some((item) => !item.cleared_on))
    .map((section) => section.title);
  return { total: tracked.length, cleared, pendingTitles };
}

/** People who must sign this section today. */
export function sectionSignerIds(clearance: ClearanceRecord, section: ClearanceSection): string[] {
  if (section.signer_override_id) return [section.signer_override_id];
  if (section.section_kind === 'immediate_superior') {
    const ids = clearance.employee?.supervisor_ids ?? [];
    if (ids.length > 0) return ids;
    if (clearance.employee?.supervisor_id) return [clearance.employee.supervisor_id];
    if (clearance.immediate_head_id) return [clearance.immediate_head_id];
    return section.assignee_id ? [section.assignee_id] : [];
  }
  const headId = section.department?.head_id || section.assignee_id;
  return headId ? [headId] : [];
}

export function sectionSignerName(clearance: ClearanceRecord, section: ClearanceSection): string {
  if (section.signer_override_id) {
    return personName(section.signer_override) || 'Substitute signer';
  }
  if (section.section_kind === 'immediate_superior') {
    const names = (clearance.employee?.supervisors ?? []).map(personName).filter(Boolean);
    if (names.length > 0) return names.join(', ');
    if (clearance.employee?.supervisor) return personName(clearance.employee.supervisor);
    if (section.assignee) return personName(section.assignee);
    return clearance.immediate_head_name || 'No immediate head assigned';
  }
  if (section.department?.head) return personName(section.department.head);
  if (section.assignee) return personName(section.assignee);
  return 'No department head assigned';
}

export function canSignSection(
  clearance: ClearanceRecord,
  section: ClearanceSection,
  userId: string,
  admin: boolean
): boolean {
  if (clearance.status !== 'in_progress' || !userId) return false;
  if (admin) return true;
  return sectionSignerIds(clearance, section).includes(userId);
}

export function userOwesSignature(clearance: ClearanceRecord, userId: string): boolean {
  if (clearance.status !== 'in_progress' || !userId) return false;
  return clearance.sections.some(
    (section) =>
      sectionSignerIds(clearance, section).includes(userId) &&
      section.items.some((item) => !item.cleared_on)
  );
}

export async function fetchClearances(): Promise<ClearanceRecord[]> {
  const { data, error } = await supabase
    .from('employee_clearances')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(dbMessage(error, 'Failed to load exit clearances'));
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeClearance);
}

export async function fetchClearance(id: string): Promise<ClearanceRecord | null> {
  const { data, error } = await supabase
    .from('employee_clearances')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(dbMessage(error, 'Failed to load this exit clearance'));
  if (!data) return null;
  return normalizeClearance(data as unknown as Record<string, unknown>);
}

export async function fetchTemplate(): Promise<TemplateSection[]> {
  const { data, error } = await supabase
    .from('clearance_template_sections')
    .select(TEMPLATE_SELECT);
  if (error) throw new Error(dbMessage(error, 'Failed to load the clearance checklist'));
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map(normalizeTemplate)
    .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export async function runClearanceSchedule(): Promise<void> {
  const { error } = await supabase.rpc('clearance_run_daily');
  if (error) throw new Error(dbMessage(error, 'Failed to check last working days'));
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(dbMessage(error, fallback));
  return data as T;
}

export async function startClearance(args: {
  employeeId: string;
  resignationSubmittedOn: string;
  lastWorkingDay: string;
  acceptanceDate: string;
  reason: string;
  dailyMonthlyRate: string;
  grossPay: string;
}) {
  const id = await rpc<string>(
    'clearance_start',
    {
      p_employee_id: args.employeeId,
      p_resignation_submitted_on: args.resignationSubmittedOn,
      p_last_working_day: args.lastWorkingDay,
      p_acceptance_date: args.acceptanceDate,
      p_reason: args.reason,
      p_daily_monthly_rate: args.dailyMonthlyRate,
      p_gross_pay: args.grossPay,
    },
    'Failed to start the exit clearance'
  );
  if (args.lastWorkingDay <= manilaToday()) void flushClearanceEmails();
  return id;
}

export async function updateClearanceDetails(args: {
  id: string;
  resignationSubmittedOn: string;
  lastWorkingDay: string;
  acceptanceDate: string;
  reason: string;
  dailyMonthlyRate: string;
  grossPay: string;
}) {
  await rpc<void>(
    'clearance_update_details',
    {
      p_clearance_id: args.id,
      p_resignation_submitted_on: args.resignationSubmittedOn,
      p_last_working_day: args.lastWorkingDay,
      p_acceptance_date: args.acceptanceDate,
      p_reason: args.reason,
      p_daily_monthly_rate: args.dailyMonthlyRate,
      p_gross_pay: args.grossPay,
    },
    'Failed to update the exit clearance'
  );
  if (args.lastWorkingDay <= manilaToday()) void flushClearanceEmails();
}

export async function addClearanceItem(sectionId: string, label: string) {
  const id = await rpc<string>('clearance_add_item', { p_section_id: sectionId, p_label: label }, 'Failed to add the item');
  void flushClearanceEmails();
  return id;
}

export function deleteClearanceItem(itemId: string) {
  return rpc<void>('clearance_delete_item', { p_item_id: itemId }, 'Failed to delete the item');
}

export function signClearanceItem(itemId: string, remarks: string, deduction: string, signature: string) {
  return rpc<boolean>(
    'clearance_sign_item',
    {
      p_item_id: itemId,
      p_remarks: remarks,
      p_deduction: deduction,
      p_signature: signature,
    },
    'Failed to sign the item'
  );
}

export function unsignClearanceItem(itemId: string) {
  return rpc<void>('clearance_unsign_item', { p_item_id: itemId }, 'Failed to remove the signature');
}

export function cancelClearance(id: string, note: string) {
  return rpc<void>('clearance_cancel', { p_clearance_id: id, p_note: note }, 'Failed to cancel the clearance');
}

export async function fetchSectionSignerOptions(sectionId: string): Promise<PersonRef[]> {
  const { data, error } = await supabase.rpc('clearance_section_signer_options', { p_section_id: sectionId });
  if (error) throw new Error(dbMessage(error, 'Failed to load people who can sign'));
  return (data ?? []) as PersonRef[];
}

export async function setSectionSigner(sectionId: string, employeeId: string | null) {
  const sent = await rpc<number>(
    'clearance_set_section_signer',
    { p_section_id: sectionId, p_employee_id: employeeId },
    'Failed to change the signer'
  );
  void flushClearanceEmails();
  return sent ?? 0;
}

export async function remindClearance(id: string) {
  const sent = await rpc<number>('clearance_remind', { p_clearance_id: id }, 'Failed to send reminders');
  void flushClearanceEmails();
  return sent;
}

export function syncTemplateDepartments() {
  return rpc<number>('clearance_sync_template_departments', {}, 'Failed to add departments');
}
