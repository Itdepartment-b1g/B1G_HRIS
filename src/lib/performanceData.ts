import { supabase } from '@/lib/supabase';

export interface PersonOption {
  id: string;
  name: string;
}

export interface DirectoryEmployee {
  id: string;
  name: string;
  employee_code: string;
  supervisor_id: string | null;
  employment_status_id: string | null;
  hired_date: string | null;
}

export interface PeopleDirectory {
  employees: DirectoryEmployee[];
  byId: Map<string, DirectoryEmployee>;
  /** Active immediate superiors of an employee (primary + assigned), as selectable evaluators. */
  superiorsOf: (employeeId: string) => PersonOption[];
  hrDepartmentId: string | null;
  /** Active employees in the Human Resources department (HR signer candidates). */
  hrOptions: PersonOption[];
}

export interface PerformanceSettings {
  hr_department_id: string | null;
  go_live_date: string;
  reminder_days_before: number;
}

export interface EmploymentStatusOption {
  id: string;
  name: string;
  is_active: boolean;
}

export async function loadPeopleDirectory(): Promise<PeopleDirectory> {
  const [empRes, supRes, settingsRes] = await Promise.all([
    supabase
      .from('employees')
      .select('id, first_name, last_name, employee_code, supervisor_id, employment_status_id, hired_date, is_active')
      .eq('is_active', true)
      .order('first_name'),
    supabase.from('employee_supervisors').select('employee_id, supervisor_id'),
    supabase.from('performance_settings').select('hr_department_id').eq('id', 1).maybeSingle(),
  ]);

  if (empRes.error) throw empRes.error;

  const employees: DirectoryEmployee[] = (empRes.data || []).map((e) => ({
    id: e.id,
    name: `${e.first_name} ${e.last_name}`.trim(),
    employee_code: e.employee_code,
    supervisor_id: e.supervisor_id,
    employment_status_id: e.employment_status_id,
    hired_date: e.hired_date,
  }));
  const byId = new Map(employees.map((e) => [e.id, e]));

  const extraSupervisors = new Map<string, Set<string>>();
  for (const row of supRes.data || []) {
    if (!extraSupervisors.has(row.employee_id)) extraSupervisors.set(row.employee_id, new Set());
    extraSupervisors.get(row.employee_id)!.add(row.supervisor_id);
  }

  const superiorsOf = (employeeId: string): PersonOption[] => {
    const emp = byId.get(employeeId);
    const ids = new Set<string>(extraSupervisors.get(employeeId) ?? []);
    if (emp?.supervisor_id) ids.add(emp.supervisor_id);
    return [...ids]
      .map((sid) => byId.get(sid))
      .filter((s): s is DirectoryEmployee => !!s)
      .map((s) => ({ id: s.id, name: s.name }));
  };

  const hrDepartmentId = settingsRes.data?.hr_department_id ?? null;
  let hrOptions: PersonOption[] = [];
  if (hrDepartmentId) {
    const { data: hrRows, error: hrErr } = await supabase
      .from('employee_departments')
      .select('employee_id')
      .eq('department_id', hrDepartmentId);
    if (hrErr) throw hrErr;
    const hrIds = new Set((hrRows || []).map((r) => r.employee_id));
    hrOptions = employees.filter((e) => hrIds.has(e.id)).map((e) => ({ id: e.id, name: e.name }));
  }

  return { employees, byId, superiorsOf, hrDepartmentId, hrOptions };
}

export async function loadPerformanceSettings(): Promise<PerformanceSettings> {
  const { data, error } = await supabase
    .from('performance_settings')
    .select('hr_department_id, go_live_date, reminder_days_before')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return {
    hr_department_id: data?.hr_department_id ?? null,
    go_live_date: data?.go_live_date ?? new Date().toISOString().slice(0, 10),
    reminder_days_before: data?.reminder_days_before ?? 7,
  };
}

export async function loadEmploymentStatuses(): Promise<EmploymentStatusOption[]> {
  const { data, error } = await supabase
    .from('employment_statuses')
    .select('id, name, is_active')
    .order('name');
  if (error) throw error;
  return (data || []) as EmploymentStatusOption[];
}

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}
