import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Briefcase, Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface Status {
  id: string;
  name: string;
  duration_months: number | null;
  description: string | null;
  is_active: boolean;
  is_regular?: boolean;
  created_at: string;
}

const EmploymentStatus = () => {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formMonths, setFormMonths] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formIsRegular, setFormIsRegular] = useState(true);
  const [editing, setEditing] = useState<Status | null>(null);
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [viewing, setViewing] = useState<Status | null>(null);
  const [page, setPage] = useState(1);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('employment_statuses').select('*').order('name');
    if (error) { toast.error('Failed to load'); console.error(error); }
    else setStatuses(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = statuses;
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const reset = () => { setFormName(''); setFormMonths(''); setFormDescription(''); setFormIsActive(true); setFormIsRegular(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('employment_statuses').insert({
      name: formName.trim(),
      duration_months: formMonths ? parseInt(formMonths) : null,
      description: formDescription.trim() || null,
      is_active: formIsActive,
      is_regular: formIsRegular,
    });
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" created`); setAddOpen(false); reset(); fetch(); }
    setSaving(false);
  };

  const openEdit = (s: Status) => {
    setEditing(s);
    setFormName(s.name);
    setFormMonths(s.duration_months?.toString() || '');
    setFormDescription(s.description || '');
    setFormIsActive(s.is_active);
    setFormIsRegular(s.is_regular ?? true);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('employment_statuses').update({
      name: formName.trim(),
      duration_months: formMonths ? parseInt(formMonths) : null,
      description: formDescription.trim() || null,
      is_active: formIsActive,
      is_regular: formIsRegular,
    }).eq('id', editing.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" updated`); setEditOpen(false); setEditing(null); reset(); fetch(); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from('employment_statuses').delete().eq('id', deleting.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${deleting.name}" deleted`); setDeleteOpen(false); setDeleting(null); fetch(); }
    setSaving(false);
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Status Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Probationary" required />
      </div>
      <div className="space-y-2">
        <Label>Duration (months)</Label>
        <Input type="number" min="0" value={formMonths} onChange={(e) => setFormMonths(e.target.value)} placeholder="e.g. 6 (leave blank if no limit)" />
        <p className="text-xs text-muted-foreground">How many months this status lasts. Leave blank for indefinite (e.g. Regular).</p>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description..." rows={2} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="es-active" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <Label htmlFor="es-active" className="cursor-pointer">Active</Label>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="es-regular" checked={formIsRegular} onChange={(e) => setFormIsRegular(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <Label htmlFor="es-regular" className="cursor-pointer">Regular (eligible for VL, SL, PTO)</Label>
      </div>
      <p className="text-xs text-muted-foreground">Uncheck for Probationary and other statuses that can only use LWOP.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employment Status</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage employment statuses like Probationary, Regular, Contractual</p>
        </div>
        <Button onClick={() => { reset(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Status
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            All Statuses ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead>Leave Eligible</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">{s.name}</TableCell>
                    <TableCell className="text-sm">{s.duration_months ? `${s.duration_months} month${s.duration_months !== 1 ? 's' : ''}` : 'Indefinite'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{s.description || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={(s.is_regular ?? true) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                        {(s.is_regular ?? true) ? 'VL, SL, PTO' : 'LWOP only'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={s.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleting(s); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No employment statuses found</TableCell></TableRow>
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
      <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Status Details
            </DialogTitle>
            <DialogDescription>{viewing?.name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewing.name}</p></div>
                <div><span className="text-muted-foreground text-sm">Duration</span><p>{viewing.duration_months ? `${viewing.duration_months} month${viewing.duration_months !== 1 ? 's' : ''}` : 'Indefinite'}</p></div>
                <div><span className="text-muted-foreground text-sm">Leave Eligible</span><p><Badge variant="outline" className={(viewing.is_regular ?? true) ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}>{(viewing.is_regular ?? true) ? 'VL, SL, PTO' : 'LWOP only'}</Badge></p></div>
                <div><span className="text-muted-foreground text-sm">Status</span><p><Badge variant="outline" className={viewing.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}>{viewing.is_active ? 'Active' : 'Inactive'}</Badge></p></div>
                {viewing.description && <div className="col-span-2"><span className="text-muted-foreground text-sm">Description</span><p className="text-sm mt-1">{viewing.description}</p></div>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button onClick={() => viewing && openEdit(viewing)} className="bg-primary hover:bg-primary/90 text-white">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> Add Employment Status</DialogTitle>
            <DialogDescription>Create a new employment status type.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>{renderForm()}<DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Status</DialogTitle>
            <DialogDescription>Update "{editing?.name}".</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>{renderForm()}<DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Status</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleting?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmploymentStatus;
