import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
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
import { Building2, Plus, Pencil, Trash2, Search, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface DepartmentHead {
  id: string;
  first_name: string;
  last_name: string;
}

interface Department {
  id: string;
  name: string;
  head_id: string | null;
  parent_department_id: string | null;
  created_at: string;
  head: DepartmentHead | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  department: string | null;
  user_roles: { role: string }[];
}

const Departments = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeCounts, setEmployeeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formHeadId, setFormHeadId] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('departments')
      .select('*, head:employees!head_id(id, first_name, last_name)')
      .order('name');

    if (error) {
      toast.error('Failed to load departments');
      console.error(error);
    } else {
      setDepartments(data || []);
    }
    setLoading(false);
  }, []);

  const fetchEmployees = useCallback(async () => {
    const [empRes, roleRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, department').eq('is_active', true).order('first_name'),
      supabase.from('user_roles').select('user_id, role'),
    ]);

    const roleMap = new Map<string, { role: string }[]>();
    (roleRes.data || []).forEach((r) => {
      const existing = roleMap.get(r.user_id) || [];
      existing.push({ role: r.role });
      roleMap.set(r.user_id, existing);
    });

    const merged = (empRes.data || []).map((e) => ({
      ...e,
      user_roles: roleMap.get(e.id) || [],
    }));
    setEmployees(merged as Employee[]);

    const counts: Record<string, number> = {};
    merged.forEach((emp) => {
      if (emp.department) {
        counts[emp.department] = (counts[emp.department] || 0) + 1;
      }
    });
    setEmployeeCounts(counts);
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchEmployees();
  }, [fetchDepartments, fetchEmployees]);

  const supervisorsOnly = employees.filter((e) =>
    e.user_roles?.some((r) => r.role === 'supervisor')
  );

  const filtered = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFormName('');
    setFormHeadId('');
    setFormParentId('');
  };

  // --- ADD ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase.from('departments').insert({
        name: formName.trim(),
        head_id: formHeadId || null,
        parent_department_id: formParentId || null,
      });

      if (error) throw error;
      toast.success(`Department "${formName}" created`);
      setAddOpen(false);
      resetForm();
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create department');
    } finally {
      setSaving(false);
    }
  };

  // --- EDIT ---
  const openEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormName(dept.name);
    setFormHeadId(dept.head_id || '');
    setFormParentId(dept.parent_department_id || '');
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept || !formName.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('departments')
        .update({
          name: formName.trim(),
          head_id: formHeadId || null,
          parent_department_id: formParentId || null,
        })
        .eq('id', editingDept.id);

      if (error) throw error;
      toast.success(`Department "${formName}" updated`);
      setEditOpen(false);
      setEditingDept(null);
      resetForm();
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update department');
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE ---
  const confirmDelete = async () => {
    if (!deletingDept) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', deletingDept.id);

      if (error) throw error;
      toast.success(`Department "${deletingDept.name}" deleted`);
      setDeleteOpen(false);
      setDeletingDept(null);
      fetchDepartments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete department');
    } finally {
      setSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Department Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Engineering" required />
      </div>
      <div className="space-y-2">
        <Label>Department Head</Label>
        <Select value={formHeadId} onValueChange={(v) => setFormHeadId(v === '_none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Select head" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">None</SelectItem>
            {supervisorsOnly.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.first_name} {e.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Only employees with Supervisor role can be assigned as head</p>
      </div>
      <div className="space-y-2">
        <Label>Parent Department</Label>
        <Select value={formParentId} onValueChange={(v) => setFormParentId(v === '_none' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">None (top-level)</SelectItem>
            {departments
              .filter((d) => d.id !== editingDept?.id)
              .map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Departments</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage company departments and their heads</p>
        </div>
        <Button onClick={() => { resetForm(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Department
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search departments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            All Departments ({filtered.length})
          </CardTitle>
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
                  <TableHead>Department</TableHead>
                  <TableHead>Department Head</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{dept.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {dept.head ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-amber-100 text-amber-700 text-xs">
                              {dept.head.first_name[0]}{dept.head.last_name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{dept.head.first_name} {dept.head.last_name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {employeeCounts[dept.name] || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(dept)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingDept(dept); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No departments found
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Add Department
            </DialogTitle>
            <DialogDescription>Create a new department and assign a head/manager.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {renderForm()}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Department
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Department
            </DialogTitle>
            <DialogDescription>Update "{editingDept?.name}" department details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {renderForm()}
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
            <AlertDialogTitle>Delete Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingDept?.name}</strong>?
              Employees currently assigned to this department will not be removed but their department reference may become stale.
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

export default Departments;
