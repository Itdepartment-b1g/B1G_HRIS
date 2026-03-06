import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { createUser, deleteUser, updateUserProfile, type UserRole } from '@/lib/edgeFunctions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Pencil, Trash2, Search, Loader2, ChevronRight, ChevronLeft, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn, timeTo12Hour } from '@/lib/utils';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

// ── Types ──────────────────────────────────────────────

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  nickname: string | null;
  gender: string | null;
  birthdate: string | null;
  birthplace: string | null;
  civil_status: string | null;
  nationality: string | null;
  personal_email: string | null;
  present_address: string | null;
  permanent_address: string | null;
  email: string;
  phone: string | null;
  department: string | null;
  department_id: string | null;
  position: string | null;
  position_id: string | null;
  employment_status_id: string | null;
  cost_center_id: string | null;
  company_email: string | null;
  avatar_url: string | null;
  supervisor_id: string | null;
  is_active: boolean;
  hired_date: string | null;
  overtime_exempted?: boolean;
  late_exempted?: boolean;
  night_differential_exempted?: boolean;
  undertime_exempted?: boolean;
  grace_period_exempted?: boolean;
  login_exempted?: boolean;
  created_at: string;
  user_roles: { role: string }[];
}

interface LookupItem { id: string; name: string; }

interface ShiftItem { id: string; name: string; start_time: string; end_time: string; days: string[]; }

// ── Constants ──────────────────────────────────────────

const CIVIL_STATUSES = ['Single', 'Married', 'Annulled', 'Divorced', 'Separated', 'Widowed'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const SUFFIXES = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];

const ROLE_LABELS: Record<string, string> = {
  employee: 'Rank and File',
  supervisor: 'Supervisory',
  manager: 'Manager',
  executive: 'Executive',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

const ROLE_STYLES: Record<string, string> = {
  super_admin: 'bg-primary/10 text-primary border-primary/20',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  supervisor: 'bg-amber-100 text-amber-700 border-amber-200',
  manager: 'bg-teal-100 text-teal-700 border-teal-200',
  executive: 'bg-purple-100 text-purple-700 border-purple-200',
  employee: 'bg-secondary text-secondary-foreground',
};

const emptyPersonal = {
  first_name: '',
  middle_name: '',
  last_name: '',
  suffix: '',
  nickname: '',
  gender: '',
  birthdate: '',
  birthplace: '',
  civil_status: '',
  nationality: '',
  phone: '',
  personal_email: '',
  present_address: '',
  permanent_address: '',
};

const emptyEmployment = {
  employee_code: '',
  email: '',
  password: 'password123',
  hired_date: new Date().toISOString().split('T')[0],
  employment_status_id: '',
  position_id: '',
  department_id: '',
  role: 'employee' as string,
  cost_center_id: '',
  company_email: '',
  overtime_exempted: false,
  late_exempted: false,
  undertime_exempted: false,
  grace_period_exempted: false,
  login_exempted: false,
};

// ── Helpers ────────────────────────────────────────────

function computeAge(birthdate: string): number | null {
  if (!birthdate) return null;
  const bd = new Date(birthdate + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

// ── Component ──────────────────────────────────────────

const Employees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formStep, setFormStep] = useState<1 | 2>(1);

  const [personal, setPersonal] = useState(emptyPersonal);
  const [employment, setEmployment] = useState(emptyEmployment);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [viewingWorkLocations, setViewingWorkLocations] = useState<string[]>([]);
  const [viewingSupervisors, setViewingSupervisors] = useState<string[]>([]);
  const [viewingShifts, setViewingShifts] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  // Multi-select states
  const [selectedWorkLocations, setSelectedWorkLocations] = useState<string[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<string[]>([]);

  // Lookup data
  const [departments, setDepartments] = useState<LookupItem[]>([]);
  const [positions, setPositions] = useState<LookupItem[]>([]);
  const [employmentStatuses, setEmploymentStatuses] = useState<LookupItem[]>([]);
  const [workLocations, setWorkLocations] = useState<LookupItem[]>([]);
  const [costCenters, setCostCenters] = useState<LookupItem[]>([]);
  const [shifts, setShifts] = useState<ShiftItem[]>([]);

  // ── Data Fetching ────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const [empResult, rolesResult] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: true }),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (empResult.error) {
      toast.error('Failed to load employees');
    } else {
      const roleMap = new Map<string, { role: string }[]>();
      (rolesResult.data || []).forEach((r) => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push({ role: r.role });
        roleMap.set(r.user_id, existing);
      });
      setEmployees(
        (empResult.data || []).map((emp) => ({ ...emp, user_roles: roleMap.get(emp.id) || [] })) as Employee[]
      );
    }
    setLoading(false);
  }, []);

  const fetchLookups = useCallback(async () => {
    const [deptRes, posRes, esRes, wlRes, ccRes, shRes] = await Promise.all([
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('positions').select('id, name').order('name'),
      supabase.from('employment_statuses').select('id, name').eq('is_active', true).order('name'),
      supabase.from('work_locations').select('id, name').eq('is_active', true).order('name'),
      supabase.from('cost_centers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('shifts').select('id, name, start_time, end_time, days').eq('is_active', true).order('name'),
    ]);
    setDepartments(deptRes.data || []);
    setPositions(posRes.data || []);
    setEmploymentStatuses(esRes.data || []);
    setWorkLocations(wlRes.data || []);
    setCostCenters(ccRes.data || []);
    setShifts((shRes.data as ShiftItem[]) || []);
  }, []);

  useEffect(() => { fetchEmployees(); fetchLookups(); }, [fetchEmployees, fetchLookups]);

  useEffect(() => {
    if (!viewingEmployee?.id) {
      setViewingWorkLocations([]);
      setViewingSupervisors([]);
      setViewingShifts([]);
      return;
    }
    const load = async () => {
      const [wlRes, supRes, shRes] = await Promise.all([
        supabase.from('employee_work_locations').select('work_location_id').eq('employee_id', viewingEmployee.id),
        supabase.from('employee_supervisors').select('supervisor_id').eq('employee_id', viewingEmployee.id),
        supabase.from('employee_shifts').select('shift_id').eq('employee_id', viewingEmployee.id),
      ]);
      const wlIds = (wlRes.data || []).map((r: { work_location_id: string }) => r.work_location_id);
      const supIds = (supRes.data || []).map((r: { supervisor_id: string }) => r.supervisor_id);
      const shIds = (shRes.data || []).map((r: { shift_id: string }) => r.shift_id);
      setViewingWorkLocations(wlIds.map((id) => workLocations.find((w) => w.id === id)?.name).filter(Boolean) as string[]);
      setViewingSupervisors(supIds.map((id) => {
        const emp = employees.find((e) => e.id === id);
        return emp ? `${emp.first_name} ${emp.last_name}` : null;
      }).filter(Boolean) as string[]);
      setViewingShifts(shIds.map((id) => shifts.find((s) => s.id === id)?.name).filter(Boolean) as string[]);
    };
    load();
  }, [viewingEmployee?.id, workLocations, employees, shifts]);

  // ── Derived ──────────────────────────────────────────

  const getRole = (emp: Employee): string => emp.user_roles?.[0]?.role || 'employee';

  const supervisorCandidates = useMemo(
    () => employees.filter((e) => ['supervisor', 'admin', 'super_admin', 'manager', 'executive'].includes(getRole(e))),
    [employees]
  );

  const filtered = employees.filter((emp) => {
    const name = `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.employee_code}`.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || getRole(emp) === roleFilter;
    return matchesSearch && matchesRole;
  });

  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  useEffect(() => setPage(1), [search, roleFilter]);

  // ── Form Helpers ─────────────────────────────────────

  const setP = (field: string, value: string) => setPersonal((prev) => ({ ...prev, [field]: value }));
  const setE = (field: string, value: string) => setEmployment((prev) => ({ ...prev, [field]: value }));

  const resetForm = () => {
    setPersonal(emptyPersonal);
    setEmployment(emptyEmployment);
    setSelectedWorkLocations([]);
    setSelectedSupervisors([]);
    setSelectedShifts([]);
    setFormStep(1);
  };

  const toggleMulti = (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>, id: string, max?: number) => {
    setArr((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (max && prev.length >= max) { toast.error(`Maximum of ${max} allowed`); return prev; }
      return [...prev, id];
    });
  };

  const canProceedToStep2 = personal.first_name.trim() && personal.last_name.trim() && personal.phone.trim();

  // ── Junction Table Saves ─────────────────────────────

  const saveJunctions = async (employeeId: string) => {
    // Work locations
    await supabase.from('employee_work_locations').delete().eq('employee_id', employeeId);
    if (selectedWorkLocations.length > 0) {
      await supabase.from('employee_work_locations').insert(
        selectedWorkLocations.map((wlId) => ({ employee_id: employeeId, work_location_id: wlId }))
      );
    }

    // Supervisors
    await supabase.from('employee_supervisors').delete().eq('employee_id', employeeId);
    if (selectedSupervisors.length > 0) {
      await supabase.from('employee_supervisors').insert(
        selectedSupervisors.map((sId) => ({ employee_id: employeeId, supervisor_id: sId }))
      );
    }

    // Shifts
    await supabase.from('employee_shifts').delete().eq('employee_id', employeeId);
    if (selectedShifts.length > 0) {
      await supabase.from('employee_shifts').insert(
        selectedShifts.map((shId) => ({ employee_id: employeeId, shift_id: shId }))
      );
    }
  };

  const buildEmployeeUpdate = () => ({
    middle_name: personal.middle_name || null,
    suffix: personal.suffix || null,
    nickname: personal.nickname || null,
    gender: personal.gender || null,
    birthdate: personal.birthdate || null,
    birthplace: personal.birthplace || null,
    civil_status: personal.civil_status || null,
    nationality: personal.nationality || null,
    personal_email: personal.personal_email || null,
    present_address: personal.present_address || null,
    permanent_address: personal.permanent_address || null,
    employment_status_id: employment.employment_status_id || null,
    position_id: employment.position_id || null,
    department_id: employment.department_id || null,
    cost_center_id: employment.cost_center_id || null,
    company_email: employment.company_email || null,
    supervisor_id: selectedSupervisors[0] || null,
    overtime_exempted: employment.overtime_exempted,
    late_exempted: employment.late_exempted,
    undertime_exempted: employment.undertime_exempted,
    grace_period_exempted: employment.grace_period_exempted,
    login_exempted: employment.login_exempted,
  });

  // ── ADD ──────────────────────────────────────────────

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const deptName = departments.find((d) => d.id === employment.department_id)?.name;
      const posName = positions.find((p) => p.id === employment.position_id)?.name;

      const result = await createUser({
        email: employment.email,
        password: employment.password,
        employee_code: employment.employee_code,
        first_name: personal.first_name,
        last_name: personal.last_name,
        phone: personal.phone || undefined,
        department: deptName || undefined,
        position: posName || undefined,
        role: employment.role as UserRole,
        hired_date: employment.hired_date || undefined,
      });

      const userId = result.user.id;

      await supabase.from('employees').update(buildEmployeeUpdate()).eq('id', userId);
      await saveJunctions(userId);

      toast.success('Employee created successfully');
      setAddOpen(false);
      resetForm();
      fetchEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  // ── EDIT ─────────────────────────────────────────────

  const openEdit = async (emp: Employee) => {
    setEditingEmployee(emp);
    setPersonal({
      first_name: emp.first_name,
      middle_name: emp.middle_name || '',
      last_name: emp.last_name,
      suffix: emp.suffix || '',
      nickname: emp.nickname || '',
      gender: emp.gender || '',
      birthdate: emp.birthdate || '',
      birthplace: emp.birthplace || '',
      civil_status: emp.civil_status || '',
      nationality: emp.nationality || '',
      phone: emp.phone || '',
      personal_email: emp.personal_email || '',
      present_address: emp.present_address || '',
      permanent_address: emp.permanent_address || '',
    });
    setEmployment({
      employee_code: emp.employee_code,
      email: emp.email,
      password: '',
      hired_date: emp.hired_date || '',
      employment_status_id: emp.employment_status_id || '',
      position_id: emp.position_id || '',
      department_id: emp.department_id || '',
      role: getRole(emp),
      cost_center_id: emp.cost_center_id || '',
      company_email: emp.company_email || '',
      overtime_exempted: emp.overtime_exempted ?? false,
      late_exempted: emp.late_exempted ?? false,
      undertime_exempted: emp.undertime_exempted ?? false,
      grace_period_exempted: emp.grace_period_exempted ?? false,
      login_exempted: emp.login_exempted ?? false,
    });

    // Fetch junction data
    const [wlRes, supRes, shRes] = await Promise.all([
      supabase.from('employee_work_locations').select('work_location_id').eq('employee_id', emp.id),
      supabase.from('employee_supervisors').select('supervisor_id').eq('employee_id', emp.id),
      supabase.from('employee_shifts').select('shift_id').eq('employee_id', emp.id),
    ]);
    setSelectedWorkLocations((wlRes.data || []).map((r) => r.work_location_id));
    setSelectedSupervisors((supRes.data || []).map((r) => r.supervisor_id));
    setSelectedShifts((shRes.data || []).map((r) => r.shift_id));

    setFormStep(1);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setSaving(true);
    try {
      const deptName = departments.find((d) => d.id === employment.department_id)?.name;
      const posName = positions.find((p) => p.id === employment.position_id)?.name;

      await updateUserProfile(
        { user_id: editingEmployee.id },
        {
          employee_code: employment.employee_code,
          first_name: personal.first_name,
          last_name: personal.last_name,
          phone: personal.phone || undefined,
          department: deptName || undefined,
          position: posName || undefined,
          role: employment.role as UserRole,
          hired_date: employment.hired_date || undefined,
          is_active: editingEmployee.is_active,
        }
      );

      await supabase.from('employees').update(buildEmployeeUpdate()).eq('id', editingEmployee.id);
      await saveJunctions(editingEmployee.id);

      toast.success('Employee updated successfully');
      setEditOpen(false);
      setEditingEmployee(null);
      resetForm();
      fetchEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  // ── DELETE ───────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deletingEmployee) return;
    setSaving(true);
    try {
      await deleteUser(deletingEmployee.id);
      toast.success(`${deletingEmployee.first_name} ${deletingEmployee.last_name} deleted`);
      setDeleteOpen(false);
      setDeletingEmployee(null);
      fetchEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete employee');
    } finally {
      setSaving(false);
    }
  };

  // ── Tab 1: Personal Information ──────────────────────

  const renderPersonalTab = () => (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold border-b pb-2">Employee Information</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>First Name <span className="text-red-500">*</span></Label>
          <Input value={personal.first_name} onChange={(e) => setP('first_name', e.target.value)} placeholder="John" required />
        </div>
        <div className="space-y-2">
          <Label>Middle Name</Label>
          <Input value={personal.middle_name} onChange={(e) => setP('middle_name', e.target.value)} placeholder="Michael" />
        </div>
        <div className="space-y-2">
          <Label>Last Name <span className="text-red-500">*</span></Label>
          <Input value={personal.last_name} onChange={(e) => setP('last_name', e.target.value)} placeholder="Doe" required />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Suffix</Label>
          <Select value={personal.suffix} onValueChange={(v) => setP('suffix', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">None</SelectItem>
              {SUFFIXES.filter(Boolean).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nickname</Label>
          <Input value={personal.nickname} onChange={(e) => setP('nickname', e.target.value)} placeholder="Johnny" />
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Select value={personal.gender} onValueChange={(v) => setP('gender', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Birthdate</Label>
          <Input type="date" value={personal.birthdate} onChange={(e) => setP('birthdate', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Age</Label>
          <Input value={personal.birthdate ? (computeAge(personal.birthdate) ?? '—').toString() : ''} disabled className="bg-muted" />
        </div>
        <div className="space-y-2">
          <Label>Birthplace</Label>
          <Input value={personal.birthplace} onChange={(e) => setP('birthplace', e.target.value)} placeholder="City, Province" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Civil Status</Label>
          <Select value={personal.civil_status} onValueChange={(v) => setP('civil_status', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {CIVIL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Nationality</Label>
          <Input value={personal.nationality} onChange={(e) => setP('nationality', e.target.value)} placeholder="Filipino" />
        </div>
        <div className="space-y-2">
          <Label>Phone Number <span className="text-red-500">*</span></Label>
          <Input type="tel" value={personal.phone} onChange={(e) => setP('phone', e.target.value)} placeholder="+63-917-1234567" required />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Personal Email Address</Label>
          <Input type="email" value={personal.personal_email} onChange={(e) => setP('personal_email', e.target.value)} placeholder="john.doe@gmail.com" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Present Address</Label>
          <Textarea value={personal.present_address} onChange={(e) => setP('present_address', e.target.value)} placeholder="House/Unit, Street, Brgy, City" rows={2} />
        </div>
        <div className="space-y-2">
          <Label>Permanent Address</Label>
          <Textarea value={personal.permanent_address} onChange={(e) => setP('permanent_address', e.target.value)} placeholder="House/Unit, Street, Brgy, City" rows={2} />
        </div>
      </div>
    </div>
  );

  // ── Tab 2: Employment Data ───────────────────────────

  const renderEmploymentTab = (isEdit: boolean) => (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold border-b pb-2">Employment Data</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date Hired <span className="text-red-500">*</span></Label>
          <Input type="date" value={employment.hired_date} onChange={(e) => setE('hired_date', e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Employee Number <span className="text-red-500">*</span></Label>
          <Input value={employment.employee_code} onChange={(e) => setE('employee_code', e.target.value)} placeholder="EMP-011" required />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Employment Status <span className="text-red-500">*</span></Label>
          <Select value={employment.employment_status_id} onValueChange={(v) => setE('employment_status_id', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {employmentStatuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Position <span className="text-red-500">*</span></Label>
          <Select value={employment.position_id} onValueChange={(v) => setE('position_id', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Department <span className="text-red-500">*</span></Label>
          <Select value={employment.department_id} onValueChange={(v) => setE('department_id', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Level / Role <span className="text-red-500">*</span></Label>
          <Select value={employment.role} onValueChange={(v) => setE('role', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Work Locations multi-select */}
      <div className="space-y-2">
        <Label>Work Location <span className="text-red-500">*</span></Label>
        <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
          {workLocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No work locations available</p>
          ) : workLocations.map((wl) => (
            <label key={wl.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
              <input
                type="checkbox"
                checked={selectedWorkLocations.includes(wl.id)}
                onChange={() => toggleMulti(selectedWorkLocations, setSelectedWorkLocations, wl.id)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm">{wl.name}</span>
            </label>
          ))}
        </div>
        {selectedWorkLocations.length > 0 && (
          <p className="text-xs text-muted-foreground">{selectedWorkLocations.length} selected</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Cost Center</Label>
          <Select value={employment.cost_center_id} onValueChange={(v) => setE('cost_center_id', v === '_none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Select cost center" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">—</SelectItem>
              {costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Company Email Address</Label>
          <Input type="email" value={employment.company_email} onChange={(e) => setE('company_email', e.target.value)} placeholder="john.doe@company.com" />
        </div>
      </div>

      {/* Immediate Superior multi-select (max 2) */}
      <div className="space-y-2">
        <Label>Immediate Superior <span className="text-xs text-muted-foreground">(max 2)</span></Label>
        <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
          {supervisorCandidates.filter((s) => s.id !== editingEmployee?.id).length === 0 ? (
            <p className="text-sm text-muted-foreground">No supervisors available</p>
          ) : supervisorCandidates.filter((s) => s.id !== editingEmployee?.id).map((s) => (
            <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
              <input
                type="checkbox"
                checked={selectedSupervisors.includes(s.id)}
                onChange={() => toggleMulti(selectedSupervisors, setSelectedSupervisors, s.id, 2)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm">{s.first_name} {s.last_name}</span>
              <Badge variant="outline" className={cn('text-[10px] ml-auto', ROLE_STYLES[getRole(s)] || '')}>
                {ROLE_LABELS[getRole(s)] || getRole(s)}
              </Badge>
            </label>
          ))}
        </div>
        {selectedSupervisors.length > 0 && (
          <p className="text-xs text-muted-foreground">{selectedSupervisors.length}/2 selected</p>
        )}
      </div>

      {/* Assigned Shifts multi-select */}
      <div className="space-y-2">
        <Label>Assigned Shifts</Label>
        <div className="border rounded-md p-3 max-h-32 overflow-y-auto space-y-1">
          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts available</p>
          ) : shifts.map((sh) => (
            <label key={sh.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
              <input
                type="checkbox"
                checked={selectedShifts.includes(sh.id)}
                onChange={() => toggleMulti(selectedShifts, setSelectedShifts, sh.id)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm">{sh.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {timeTo12Hour(sh.start_time || '')}–{timeTo12Hour(sh.end_time || '')} ({sh.days?.join(', ')})
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Exemptions — Login Exempted only (others hidden for now) */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Exemptions</Label>
        <div className="border rounded-md p-4 bg-muted/30">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={employment.login_exempted}
              onChange={(e) => setEmployment((prev) => ({ ...prev, login_exempted: e.target.checked }))}
              className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm">Login Exempted — no time in/out required; attendance is auto-recorded based on assigned shift</span>
          </label>
        </div>
      </div>

      {!isEdit && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Email (for login) <span className="text-red-500">*</span></Label>
            <Input type="email" value={employment.email} onChange={(e) => setE('email', e.target.value)} placeholder="user@company.com" required />
          </div>
          <div className="space-y-2">
            <Label>Initial Password</Label>
            <Input type="text" value={employment.password} onChange={(e) => setE('password', e.target.value)} className="font-mono" required />
            <p className="text-xs text-muted-foreground">User can change this after first login</p>
          </div>
        </div>
      )}
    </div>
  );

  // ── Stepper UI ───────────────────────────────────────

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-4">
      <button
        type="button"
        onClick={() => setFormStep(1)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
          formStep === 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
        )}
      >
        <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs">1</span>
        Employee Info
      </button>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <button
        type="button"
        onClick={() => { if (canProceedToStep2) setFormStep(2); }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
          formStep === 2 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground',
          !canProceedToStep2 && formStep !== 2 && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center text-xs">2</span>
        Employment Data
      </button>
    </div>
  );

  const renderFormFooter = (isEdit: boolean) => {
    if (formStep === 1) {
      return (
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => { isEdit ? setEditOpen(false) : setAddOpen(false); }} disabled={saving}>Cancel</Button>
          <Button
            type="button"
            onClick={() => { if (canProceedToStep2) setFormStep(2); }}
            disabled={!canProceedToStep2}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      );
    }
    return (
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={() => setFormStep(1)} disabled={saving}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Employee'}
        </Button>
      </DialogFooter>
    );
  };

  // ── Render ───────────────────────────────────────────

  const roleBadge = (role: string) => (
    <Badge variant="outline" className={ROLE_STYLES[role] || ''}>
      {ROLE_LABELS[role] || role.replace('_', ' ')}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Employees</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage company employees and their roles</p>
        </div>
        <Button onClick={() => { resetForm(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <UserPlus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, or code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Employees ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Code</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden md:table-cell">Position</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {paginated.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{emp.employee_code}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{emp.department || '—'}</TableCell>
                    <TableCell className="text-sm hidden md:table-cell">{emp.position || '—'}</TableCell>
                    <TableCell>{roleBadge(getRole(emp))}</TableCell>
                  <TableCell>
                      <Badge variant={emp.is_active ? 'outline' : 'secondary'} className={emp.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ''}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewingEmployee(emp)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingEmployee(emp); setDeleteOpen(true); }} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                </TableRow>
              ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees found</TableCell>
                  </TableRow>
                )}
            </TableBody>
          </Table>
            {!loading && filtered.length > 0 && (
              <TablePagination
                totalItems={filtered.length}
                currentPage={page}
                onPageChange={setPage}
              />
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewingEmployee} onOpenChange={(open) => { if (!open) setViewingEmployee(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Employee Details
            </DialogTitle>
            <DialogDescription>
              {viewingEmployee && `${viewingEmployee.first_name} ${viewingEmployee.last_name}`}
            </DialogDescription>
          </DialogHeader>
          {viewingEmployee && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
              {/* Personal Information */}
              <div>
                <h4 className="text-sm font-semibold border-b pb-2 mb-3">Personal Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground text-sm">First Name</span><p className="font-medium">{viewingEmployee.first_name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Middle Name</span><p>{viewingEmployee.middle_name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Last Name</span><p className="font-medium">{viewingEmployee.last_name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Suffix</span><p>{viewingEmployee.suffix || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Nickname</span><p>{viewingEmployee.nickname || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Gender</span><p>{viewingEmployee.gender || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Birthdate</span><p>{viewingEmployee.birthdate || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Age</span><p>{viewingEmployee.birthdate ? (computeAge(viewingEmployee.birthdate) ?? '—') : '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Birthplace</span><p>{viewingEmployee.birthplace || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Civil Status</span><p>{viewingEmployee.civil_status || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Nationality</span><p>{viewingEmployee.nationality || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Phone</span><p>{viewingEmployee.phone || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Personal Email</span><p>{viewingEmployee.personal_email || '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Present Address</span><p className="text-sm">{viewingEmployee.present_address || '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Permanent Address</span><p className="text-sm">{viewingEmployee.permanent_address || '—'}</p></div>
                </div>
              </div>
              {/* Employment Information */}
              <div>
                <h4 className="text-sm font-semibold border-b pb-2 mb-3">Employment Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="text-muted-foreground text-sm">Employee Code</span><p className="font-medium">{viewingEmployee.employee_code}</p></div>
                  <div><span className="text-muted-foreground text-sm">Date Hired</span><p>{viewingEmployee.hired_date || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Employment Status</span><p>{employmentStatuses.find((s) => s.id === viewingEmployee.employment_status_id)?.name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Position</span><p>{viewingEmployee.position || positions.find((p) => p.id === viewingEmployee.position_id)?.name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Department</span><p>{viewingEmployee.department || departments.find((d) => d.id === viewingEmployee.department_id)?.name || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Role</span><p>{roleBadge(getRole(viewingEmployee))}</p></div>
                  <div><span className="text-muted-foreground text-sm">Status</span><p><Badge variant={viewingEmployee.is_active ? 'outline' : 'secondary'}>{viewingEmployee.is_active ? 'Active' : 'Inactive'}</Badge></p></div>
                  <div><span className="text-muted-foreground text-sm">Email</span><p>{viewingEmployee.email || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Company Email</span><p>{viewingEmployee.company_email || '—'}</p></div>
                  <div><span className="text-muted-foreground text-sm">Cost Center</span><p>{costCenters.find((c) => c.id === viewingEmployee.cost_center_id)?.name || '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Work Locations</span><p className="text-sm">{viewingWorkLocations.length > 0 ? viewingWorkLocations.join(', ') : '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Immediate Superior</span><p className="text-sm">{viewingSupervisors.length > 0 ? viewingSupervisors.join(', ') : '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Assigned Shifts</span><p className="text-sm">{viewingShifts.length > 0 ? viewingShifts.join(', ') : '—'}</p></div>
                  <div className="col-span-2"><span className="text-muted-foreground text-sm">Exemptions</span><p className="text-sm">{viewingEmployee.login_exempted ? 'Login Exempted' : 'None'}</p></div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingEmployee(null)}>Close</Button>
            <Button onClick={() => viewingEmployee && openEdit(viewingEmployee)} className="bg-primary hover:bg-primary/90 text-white">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { if (!open) resetForm(); setAddOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" /> Add New Employee
            </DialogTitle>
            <DialogDescription>Fill in employee information then proceed to employment data.</DialogDescription>
          </DialogHeader>
          {renderStepIndicator()}
          <form onSubmit={handleAdd}>
            <div className="max-h-[55vh] overflow-y-auto pr-1">
              {formStep === 1 ? renderPersonalTab() : renderEmploymentTab(false)}
            </div>
            {renderFormFooter(false)}
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) { resetForm(); setEditingEmployee(null); } setEditOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" /> Edit Employee
            </DialogTitle>
            <DialogDescription>
              Update {editingEmployee?.first_name} {editingEmployee?.last_name}'s information.
            </DialogDescription>
          </DialogHeader>
          {renderStepIndicator()}
          <form onSubmit={handleEdit}>
            <div className="max-h-[55vh] overflow-y-auto pr-1">
              {formStep === 1 ? renderPersonalTab() : renderEmploymentTab(true)}
            </div>
            {renderFormFooter(true)}
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingEmployee?.first_name} {deletingEmployee?.last_name}</strong>?
              This will remove their authentication account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Employees;
