import { useEffect, useState, useCallback, useMemo } from 'react';
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
import { Building2, Plus, Pencil, Trash2, Search, Loader2, Users, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

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
  const [viewingDept, setViewingDept] = useState<Department | null>(null);
  const [page, setPage] = useState(1);

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
    const [empRes, roleRes, edRes, deptRes] = await Promise.all([
      supabase.from('employees').select('id, first_name, last_name, department').eq('is_active', true).order('first_name'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('employee_departments').select('employee_id, department_id'),
      supabase.from('departments').select('id, name'),
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

    const deptMap = new Map<string, string>((deptRes.data || []).map((d) => [d.id, d.name]));
    const counts: Record<string, number> = {};
    (edRes.data || []).forEach((ed: { employee_id: string; department_id: string }) => {
      const deptName = deptMap.get(ed.department_id);
      if (deptName) {
        counts[deptName] = (counts[deptName] || 0) + 1;
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
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => setPage(1), [search]);

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
            <>
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
                {paginated.map((dept) => (
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
                        <Button variant="ghost" size="icon" onClick={() => setViewingDept(dept)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(dept)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingDept(dept); setDeleteOpen(true); }} title="Delete">
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
            {!loading && filtered.length > 0 && (
              <TablePagination totalItems={filtered.length} currentPage={page} onPageChange={setPage} />
            )}
            </>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={!!viewingDept} onOpenChange={(open) => { if (!open) setViewingDept(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Department Details
            </DialogTitle>
            <DialogDescription>{viewingDept?.name}</DialogDescription>
          </DialogHeader>
          {viewingDept && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewingDept.name}</p></div>
                <div><span className="text-muted-foreground text-sm">Department Head</span><p>{viewingDept.head ? `${viewingDept.head.first_name} ${viewingDept.head.last_name}` : '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Employees</span><p><Badge variant="outline" className="gap-1"><Users className="h-3 w-3" />{employeeCounts[viewingDept.name] || 0}</Badge></p></div>
                <div className="col-span-2"><span className="text-muted-foreground text-sm">Parent Department</span><p>{viewingDept.parent_department_id ? departments.find((d) => d.id === viewingDept.parent_department_id)?.name || '—' : 'None (top-level)'}</p></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingDept(null)}>Close</Button>
            <Button onClick={() => viewingDept && openEdit(viewingDept)} className="bg-primary hover:bg-primary/90 text-white">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
