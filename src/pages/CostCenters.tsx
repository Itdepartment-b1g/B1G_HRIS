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
import { Wallet, Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface CostCenter {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

const CostCenters = () => {
  const [items, setItems] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [deleting, setDeleting] = useState<CostCenter | null>(null);
  const [viewing, setViewing] = useState<CostCenter | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cost_centers').select('*').order('name');
    if (error) { toast.error('Failed to load cost centers'); console.error(error); }
    else setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items;
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const reset = () => { setFormName(''); setFormIsActive(true); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('cost_centers').insert({ name: formName.trim(), is_active: formIsActive });
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" created`); setAddOpen(false); reset(); fetchData(); }
    setSaving(false);
  };

  const openEdit = (c: CostCenter) => {
    setEditing(c);
    setFormName(c.name);
    setFormIsActive(c.is_active);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('cost_centers').update({ name: formName.trim(), is_active: formIsActive }).eq('id', editing.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" updated`); setEditOpen(false); setEditing(null); reset(); fetchData(); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from('cost_centers').delete().eq('id', deleting.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${deleting.name}" deleted`); setDeleteOpen(false); setDeleting(null); fetchData(); }
    setSaving(false);
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Cost Center Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Sales, General Admin" required />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="cc-active" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <Label htmlFor="cc-active" className="cursor-pointer">Active</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cost Centers</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage cost center categories</p>
        </div>
        <Button onClick={() => { reset(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Cost Center
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            All Cost Centers ({filtered.length})
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={c.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(c)} title="View"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleting(c); setDeleteOpen(true); }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No cost centers found</TableCell></TableRow>
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
              <Eye className="h-5 w-5 text-primary" /> Cost Center Details
            </DialogTitle>
            <DialogDescription>{viewing?.name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewing.name}</p></div>
                <div><span className="text-muted-foreground text-sm">Status</span><p><Badge variant="outline" className={viewing.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}>{viewing.is_active ? 'Active' : 'Inactive'}</Badge></p></div>
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
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary" /> Add Cost Center</DialogTitle>
            <DialogDescription>Create a new cost center.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {renderForm()}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Cost Center</DialogTitle>
            <DialogDescription>Update "{editing?.name}".</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {renderForm()}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Cost Center</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleting?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CostCenters;
