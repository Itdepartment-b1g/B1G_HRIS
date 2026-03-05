import { useEffect, useState, useCallback } from 'react';
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
import { UserPlus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  avatar_url: string | null;
  supervisor_id: string | null;
  is_active: boolean;
  hired_date: string | null;
  created_at: string;
  user_roles: { role: UserRole }[];
}

interface Department {
  id: string;
  name: string;
}

const emptyForm = {
  employee_code: '',
  first_name: '',
  last_name: '',
  email: '',
  password: 'password123',
  phone: '',
  department: '',
  position: '',
  role: 'employee' as UserRole,
  hired_date: new Date().toISOString().split('T')[0],
  supervisor_id: '',
};

const ROLE_STYLES: Record<string, string> = {
  super_admin: 'bg-primary/10 text-primary border-primary/20',
  admin: 'bg-blue-100 text-blue-700 border-blue-200',
  supervisor: 'bg-amber-100 text-amber-700 border-amber-200',
  employee: 'bg-secondary text-secondary-foreground',
};

const Employees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState(emptyForm);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);

    const [empResult, rolesResult] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: true }),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    if (empResult.error) {
      toast.error('Failed to load employees');
      console.error(empResult.error);
    } else {
      const roleMap = new Map<string, { role: string }[]>();
      (rolesResult.data || []).forEach((r) => {
        const existing = roleMap.get(r.user_id) || [];
        existing.push({ role: r.role });
        roleMap.set(r.user_id, existing);
      });

      const merged = (empResult.data || []).map((emp) => ({
        ...emp,
        user_roles: roleMap.get(emp.id) || [],
      }));
      setEmployees(merged as Employee[]);
    }
    setLoading(false);
  }, []);

  const fetchDepartments = useCallback(async () => {
    const { data } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');
    setDepartments(data || []);
  }, []);

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
  }, [fetchEmployees, fetchDepartments]);

  const getRole = (emp: Employee): string =>
    emp.user_roles?.[0]?.role || 'employee';

  const supervisors = employees.filter(
    (e) => ['supervisor', 'admin', 'super_admin'].includes(getRole(e))
  );

  const filtered = employees.filter((emp) => {
    const name = `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.employee_code}`.toLowerCase();
    const matchesSearch = name.includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || getRole(emp) === roleFilter;
    return matchesSearch && matchesRole;
  });

  const setField = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  // --- ADD ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await createUser({
        email: formData.email,
        password: formData.password,
        employee_code: formData.employee_code,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone || undefined,
        department: formData.department || undefined,
        position: formData.position || undefined,
        role: formData.role,
        hired_date: formData.hired_date || undefined,
      });

      if (formData.supervisor_id) {
        await supabase.from('employees').update({ supervisor_id: formData.supervisor_id }).eq('id', result.user.id);
      }

      toast.success('Employee created successfully');
      setAddOpen(false);
      setFormData(emptyForm);
      fetchEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  // --- EDIT ---
  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormData({
      employee_code: emp.employee_code,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      password: '',
      phone: emp.phone || '',
      department: emp.department || '',
      position: emp.position || '',
      role: getRole(emp) as UserRole,
      hired_date: emp.hired_date || '',
      supervisor_id: emp.supervisor_id || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setSaving(true);

    try {
      await updateUserProfile(
        { user_id: editingEmployee.id },
        {
          employee_code: formData.employee_code,
          first_name: formData.first_name,
          last_name: formData.last_name,
          phone: formData.phone || undefined,
          department: formData.department || undefined,
          position: formData.position || undefined,
          role: formData.role,
          hired_date: formData.hired_date || undefined,
          supervisor_id: formData.supervisor_id || undefined,
          is_active: editingEmployee.is_active,
        }
      );

      toast.success('Employee updated successfully');
      setEditOpen(false);
      setEditingEmployee(null);
      fetchEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE ---
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

  const roleBadge = (role: string) => (
    <Badge variant="outline" className={ROLE_STYLES[role] || ''}>
      {role.replace('_', ' ')}
    </Badge>
  );

  const renderFormFields = (isEdit: boolean) => (
    <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-1">
      <div className="space-y-4">
        <h4 className="text-sm font-semibold border-b pb-2">Personal Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Employee Code <span className="text-red-500">*</span></Label>
            <Input value={formData.employee_code} onChange={(e) => setField('employee_code', e.target.value)} placeholder="EMP-011" required />
          </div>
          <div className="space-y-2">
            <Label>Email <span className="text-red-500">*</span></Label>
            <Input type="email" value={formData.email} onChange={(e) => setField('email', e.target.value)} placeholder="user@company.com" required disabled={isEdit} />
          </div>
          <div className="space-y-2">
            <Label>First Name <span className="text-red-500">*</span></Label>
            <Input value={formData.first_name} onChange={(e) => setField('first_name', e.target.value)} placeholder="John" required />
          </div>
          <div className="space-y-2">
            <Label>Last Name <span className="text-red-500">*</span></Label>
            <Input value={formData.last_name} onChange={(e) => setField('last_name', e.target.value)} placeholder="Doe" required />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input type="tel" value={formData.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+63-917-1234567" />
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={formData.hired_date} onChange={(e) => setField('hired_date', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-semibold border-b pb-2">Employment Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={formData.department} onValueChange={(v) => setField('department', v)}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                ))}
                <SelectItem value="Executive">Executive</SelectItem>
                <SelectItem value="Human Resources">Human Resources</SelectItem>
                <SelectItem value="IT Department">IT Department</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Position</Label>
            <Input value={formData.position} onChange={(e) => setField('position', e.target.value)} placeholder="Software Developer" />
          </div>
          <div className="space-y-2">
            <Label>Role <span className="text-red-500">*</span></Label>
            <Select value={formData.role} onValueChange={(v) => setField('role', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Supervisor</Label>
            <Select value={formData.supervisor_id} onValueChange={(v) => setField('supervisor_id', v === '_none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {supervisors
                  .filter((s) => s.id !== editingEmployee?.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {!isEdit && (
            <div className="space-y-2">
              <Label>Initial Password</Label>
              <Input type="text" value={formData.password} onChange={(e) => setField('password', e.target.value)} className="font-mono" required />
              <p className="text-xs text-muted-foreground">User can change this after first login</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage company employees and their roles</p>
        </div>
        <Button onClick={() => { setFormData(emptyForm); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <UserPlus className="h-4 w-4 mr-2" />
          Add Employee
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
            <SelectItem value="super_admin">Super Admin</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
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
                {filtered.map((emp) => (
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
                        <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingEmployee(emp); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add New Employee
            </DialogTitle>
            <DialogDescription>Create a new employee account with authentication credentials.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {renderFormFields(false)}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Employee
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Employee
            </DialogTitle>
            <DialogDescription>
              Update {editingEmployee?.first_name} {editingEmployee?.last_name}'s information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {renderFormFields(true)}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
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
