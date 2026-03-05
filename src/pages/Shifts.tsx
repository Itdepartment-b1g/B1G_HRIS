import { useEffect, useState, useCallback } from 'react';
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
import { Clock, Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const PRESETS: { label: string; days: string[] }[] = [
  { label: 'Mon–Fri', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  { label: 'Mon–Sat', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  { label: 'Everyday', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
];

function formatTime(time: string): string {
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:${m} ${ampm}`;
}

function formatDays(days: string[]): string {
  if (!days || days.length === 0) return '—';
  if (days.length === 7) return 'Everyday';
  if (days.length === 6 && !days.includes('Sun')) return 'Mon–Sat';
  if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) return 'Mon–Fri';
  return days.join(', ');
}

const Shifts = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('17:00');
  const [formDays, setFormDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .order('name');

    if (error) {
      toast.error('Failed to load shifts');
      console.error(error);
    } else {
      setShifts(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const filtered = shifts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFormName('');
    setFormStartTime('08:00');
    setFormEndTime('17:00');
    setFormDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setFormDescription('');
    setFormIsActive(true);
  };

  const toggleDay = (day: string) => {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // --- ADD ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formDays.length === 0) return;
    setSaving(true);

    try {
      const { error } = await supabase.from('shifts').insert({
        name: formName.trim(),
        start_time: formStartTime,
        end_time: formEndTime,
        days: formDays,
        description: formDescription.trim() || null,
        is_active: formIsActive,
      });

      if (error) throw error;
      toast.success(`Shift "${formName}" created`);
      setAddOpen(false);
      resetForm();
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create shift');
    } finally {
      setSaving(false);
    }
  };

  // --- EDIT ---
  const openEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormName(shift.name);
    setFormStartTime(shift.start_time.substring(0, 5));
    setFormEndTime(shift.end_time.substring(0, 5));
    setFormDays(shift.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setFormDescription(shift.description || '');
    setFormIsActive(shift.is_active);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift || !formName.trim() || formDays.length === 0) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('shifts')
        .update({
          name: formName.trim(),
          start_time: formStartTime,
          end_time: formEndTime,
          days: formDays,
          description: formDescription.trim() || null,
          is_active: formIsActive,
        })
        .eq('id', editingShift.id);

      if (error) throw error;
      toast.success(`Shift "${formName}" updated`);
      setEditOpen(false);
      setEditingShift(null);
      resetForm();
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update shift');
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE ---
  const confirmDelete = async () => {
    if (!deletingShift) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('id', deletingShift.id);

      if (error) throw error;
      toast.success(`Shift "${deletingShift.name}" deleted`);
      setDeleteOpen(false);
      setDeletingShift(null);
      fetchShifts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete shift');
    } finally {
      setSaving(false);
    }
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Shift Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Morning Shift" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Start Time <span className="text-red-500">*</span></Label>
          <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>End Time <span className="text-red-500">*</span></Label>
          <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Days <span className="text-red-500">*</span></Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
                formDays.includes(day)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-primary/50'
              )}
            >
              {day}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setFormDays([...preset.days])}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional shift description..." rows={3} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="shift-active"
          checked={formIsActive}
          onChange={(e) => setFormIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="shift-active" className="cursor-pointer">Active</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shifts</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage work shifts and schedules</p>
        </div>
        <Button onClick={() => { resetForm(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Shift
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search shifts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            All Shifts ({filtered.length})
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
                  <TableHead>Shift Name</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm">{shift.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{formatDays(shift.days)}</span>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{formatTime(shift.start_time)}</TableCell>
                    <TableCell className="text-sm font-mono">{formatTime(shift.end_time)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                      {shift.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={shift.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                        {shift.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(shift)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingShift(shift); setDeleteOpen(true); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No shifts found
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
              <Clock className="h-5 w-5 text-primary" />
              Add Shift
            </DialogTitle>
            <DialogDescription>Create a new work shift with schedule and times.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {renderForm()}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Shift
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
              Edit Shift
            </DialogTitle>
            <DialogDescription>Update "{editingShift?.name}" shift details.</DialogDescription>
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
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingShift?.name}</strong>?
              Employees currently assigned to this shift will have their shift unset.
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

export default Shifts;
