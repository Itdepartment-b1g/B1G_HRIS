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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: string;
  is_recurring: boolean;
  created_at: string;
}

const Holidays = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState('regular');
  const [formRecurring, setFormRecurring] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [viewing, setViewing] = useState<Holiday | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('holidays').select('*').order('date', { ascending: true });
    if (error) { toast.error('Failed to load'); console.error(error); }
    else setHolidays(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = holidays;
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const reset = () => { setFormName(''); setFormDate(''); setFormType('regular'); setFormRecurring(false); };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formDate) return;
    setSaving(true);
    const { error } = await supabase.from('holidays').insert({
      name: formName.trim(),
      date: formDate,
      type: formType,
      is_recurring: formRecurring,
    });
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" created`); setAddOpen(false); reset(); fetchData(); }
    setSaving(false);
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setFormName(h.name);
    setFormDate(h.date);
    setFormType(h.type);
    setFormRecurring(h.is_recurring);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !formName.trim() || !formDate) return;
    setSaving(true);
    const { error } = await supabase.from('holidays').update({
      name: formName.trim(),
      date: formDate,
      type: formType,
      is_recurring: formRecurring,
    }).eq('id', editing.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" updated`); setEditOpen(false); setEditing(null); reset(); fetchData(); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from('holidays').delete().eq('id', deleting.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${deleting.name}" deleted`); setDeleteOpen(false); setDeleting(null); fetchData(); }
    setSaving(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Holiday Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. New Year's Day" required />
      </div>
      <div className="space-y-2">
        <Label>Date <span className="text-red-500">*</span></Label>
        <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={formType} onValueChange={setFormType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">Regular Holiday</SelectItem>
            <SelectItem value="special">Special Non-Working</SelectItem>
            <SelectItem value="company">Company Holiday</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="h-recurring" checked={formRecurring} onChange={(e) => setFormRecurring(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <Label htmlFor="h-recurring" className="cursor-pointer">Recurring every year</Label>
      </div>
    </div>
  );

  const typeColors: Record<string, string> = {
    regular: 'bg-blue-50 text-blue-700 border-blue-200',
    special: 'bg-amber-50 text-amber-700 border-amber-200',
    company: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Holidays</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage company and public holidays</p>
        </div>
        <Button onClick={() => { reset(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Holiday
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            All Holidays ({filtered.length})
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
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Recurring</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium text-sm">{h.name}</TableCell>
                    <TableCell className="text-sm">{formatDate(h.date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeColors[h.type] || ''}>
                        {h.type === 'regular' ? 'Regular' : h.type === 'special' ? 'Special' : 'Company'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{h.is_recurring ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(h)} title="View"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(h)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleting(h); setDeleteOpen(true); }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No holidays found</TableCell></TableRow>
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
              <Eye className="h-5 w-5 text-primary" /> Holiday Details
            </DialogTitle>
            <DialogDescription>{viewing?.name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewing.name}</p></div>
                <div><span className="text-muted-foreground text-sm">Date</span><p>{formatDate(viewing.date)}</p></div>
                <div><span className="text-muted-foreground text-sm">Type</span><p><Badge variant="outline" className={typeColors[viewing.type] || ''}>{viewing.type === 'regular' ? 'Regular' : viewing.type === 'special' ? 'Special' : 'Company'}</Badge></p></div>
                <div><span className="text-muted-foreground text-sm">Recurring</span><p>{viewing.is_recurring ? 'Yes' : 'No'}</p></div>
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
            <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Add Holiday</DialogTitle>
            <DialogDescription>Add a new holiday to the calendar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>{renderForm()}<DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Holiday</DialogTitle>
            <DialogDescription>Update "{editing?.name}".</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>{renderForm()}<DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Changes</Button></DialogFooter></form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Holiday</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleting?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Holidays;
