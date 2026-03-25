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
import { Clock, Plus, Pencil, Trash2, Search, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  break_total_hours: number | null;
  grace_period_minutes: number | null;
  days: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
  work_location_id: string | null;
  is_flexible: boolean;
  required_daily_hours: number;
  work_location?: { name: string } | null;
}

interface WorkLocationOption {
  id: string;
  name: string;
  allow_anywhere: boolean;
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

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function computeBreakHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const startM = parseTimeToMinutes(start);
  const endM = parseTimeToMinutes(end);
  const diff = endM - startM;
  return diff <= 0 ? 0 : Math.round((diff / 60) * 100) / 100;
}

function computeShiftTotalHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const startM = parseTimeToMinutes(start);
  const endM = parseTimeToMinutes(end);
  const diff = endM >= startM ? endM - startM : 24 * 60 - startM + endM;
  return Math.round((diff / 60) * 100) / 100;
}

function computeNetWorkingHours(shiftStart: string, shiftEnd: string, breakHours: number): number {
  const gross = computeShiftTotalHours(shiftStart, shiftEnd);
  const net = Math.max(0, gross - breakHours);
  return Math.round(net * 100) / 100;
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
  const [formBreakStart, setFormBreakStart] = useState('');
  const [formBreakEnd, setFormBreakEnd] = useState('');
  const [formBreakTotalHours, setFormBreakTotalHours] = useState('');
  const [formGracePeriodMinutes, setFormGracePeriodMinutes] = useState('15');
  const [formDays, setFormDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formWorkLocationId, setFormWorkLocationId] = useState<string>('');
  const [formIsFlexible, setFormIsFlexible] = useState(false);
  const [formRequiredDailyHours, setFormRequiredDailyHours] = useState('8');

  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);
  const [viewingShift, setViewingShift] = useState<Shift | null>(null);
  const [page, setPage] = useState(1);
  const [workLocations, setWorkLocations] = useState<WorkLocationOption[]>([]);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shifts')
      .select('*, work_location:work_locations(name)')
      .order('name');

    if (error) {
      toast.error('Failed to load shifts');
      console.error(error);
    } else {
      setShifts(data || []);
    }
    setLoading(false);
  }, []);

  const fetchWorkLocations = useCallback(async () => {
    const { data } = await supabase
      .from('work_locations')
      .select('id, name, allow_anywhere')
      .eq('is_active', true)
      .order('name');
    setWorkLocations((data || []) as WorkLocationOption[]);
  }, []);

  useEffect(() => {
    fetchShifts();
    fetchWorkLocations();
  }, [fetchShifts, fetchWorkLocations]);

  const filtered = shifts.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => setPage(1), [search]);

  const resetForm = () => {
    setFormName('');
    setFormStartTime('08:00');
    setFormEndTime('17:00');
    setFormBreakStart('');
    setFormBreakEnd('');
    setFormBreakTotalHours('');
    setFormGracePeriodMinutes('15');
    setFormDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setFormDescription('');
    setFormIsActive(true);
    setFormWorkLocationId('');
    setFormIsFlexible(false);
    setFormRequiredDailyHours('8');
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
    if (!formWorkLocationId.trim()) {
      toast.error('Please select a work location.');
      return;
    }
    setSaving(true);

    try {
      const breakTotal = formBreakTotalHours ? parseFloat(formBreakTotalHours) : (formBreakStart && formBreakEnd ? computeBreakHours(formBreakStart, formBreakEnd) : null);
      const graceMins = formGracePeriodMinutes ? parseInt(formGracePeriodMinutes, 10) : 15;
      const { error } = await supabase.from('shifts').insert({
        name: formName.trim(),
        start_time: formStartTime,
        end_time: formEndTime,
        break_start_time: formBreakStart || null,
        break_end_time: formBreakEnd || null,
        break_total_hours: breakTotal,
        grace_period_minutes: graceMins >= 0 ? graceMins : 15,
        days: formDays,
        description: formDescription.trim() || null,
        is_active: formIsActive,
        work_location_id: formWorkLocationId || null,
        is_flexible: formIsFlexible,
        required_daily_hours: Math.max(1, parseFloat(formRequiredDailyHours || '8')),
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
    setFormBreakStart(shift.break_start_time?.substring(0, 5) || '');
    setFormBreakEnd(shift.break_end_time?.substring(0, 5) || '');
    setFormBreakTotalHours(shift.break_total_hours != null ? String(shift.break_total_hours) : '');
    setFormGracePeriodMinutes(shift.grace_period_minutes != null ? String(shift.grace_period_minutes) : '15');
    setFormDays(shift.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setFormDescription(shift.description || '');
    setFormIsActive(shift.is_active);
    setFormWorkLocationId(shift.work_location_id || '');
    setFormIsFlexible(shift.is_flexible ?? false);
    setFormRequiredDailyHours(
      shift.required_daily_hours != null ? String(shift.required_daily_hours) : '8'
    );
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift || !formName.trim() || formDays.length === 0) return;
    if (!formWorkLocationId.trim()) {
      toast.error('Please select a work location.');
      return;
    }
    setSaving(true);

    try {
      const breakTotal = formBreakTotalHours ? parseFloat(formBreakTotalHours) : (formBreakStart && formBreakEnd ? computeBreakHours(formBreakStart, formBreakEnd) : null);
      const graceMins = formGracePeriodMinutes ? parseInt(formGracePeriodMinutes, 10) : 15;
      const { error } = await supabase
        .from('shifts')
        .update({
          name: formName.trim(),
          start_time: formStartTime,
          end_time: formEndTime,
          break_start_time: formBreakStart || null,
          break_end_time: formBreakEnd || null,
          break_total_hours: breakTotal,
          grace_period_minutes: graceMins >= 0 ? graceMins : 15,
          days: formDays,
          description: formDescription.trim() || null,
          is_active: formIsActive,
          work_location_id: formWorkLocationId || null,
          is_flexible: formIsFlexible,
          required_daily_hours: Math.max(1, parseFloat(formRequiredDailyHours || '8')),
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
          <Input
            type="time"
            value={formStartTime}
            onChange={(e) => setFormStartTime(e.target.value)}
            required
            disabled={formIsFlexible}
          />
        </div>
        <div className="space-y-2">
          <Label>End Time <span className="text-red-500">*</span></Label>
          <Input
            type="time"
            value={formEndTime}
            onChange={(e) => setFormEndTime(e.target.value)}
            required
            disabled={formIsFlexible}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="shift-flexible"
          checked={formIsFlexible}
          onChange={(e) => setFormIsFlexible(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="shift-flexible" className="cursor-pointer">Flexible schedule</Label>
      </div>
      <div className="space-y-2">
        <Label>Required daily hours</Label>
        <Input
          type="number"
          min="1"
          max="24"
          step="0.25"
          value={formRequiredDailyHours}
          onChange={(e) => setFormRequiredDailyHours(e.target.value)}
          placeholder="8"
        />
        <p className="text-xs text-muted-foreground">
          Used for flex shifts to compute undertime. Employees can time in/out anytime, but rendered hours are measured against this value.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Grace Period (minutes allowed before marking late)</Label>
        <Input
          type="number"
          min="0"
          max="120"
          value={formGracePeriodMinutes}
          onChange={(e) => setFormGracePeriodMinutes(e.target.value)}
          placeholder="15"
          disabled={formIsFlexible}
        />
        <p className="text-xs text-muted-foreground">Minutes after shift start before marking late. E.g. 15 = time in up to start+15min is OK.</p>
      </div>
      <div className="text-sm text-muted-foreground">
        {(() => {
          const gross = computeShiftTotalHours(formStartTime, formEndTime);
          const breakH = formBreakTotalHours ? parseFloat(formBreakTotalHours) : (formBreakStart && formBreakEnd ? computeBreakHours(formBreakStart, formBreakEnd) : 0);
          const net = computeNetWorkingHours(formStartTime, formEndTime, breakH);
          return (
            <>
              Net working hours: <span className="font-medium text-foreground">{net}h</span>
              {breakH > 0 && <span className="ml-2">(gross {gross}h − break {breakH}h)</span>}
            </>
          );
        })()}
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground">Break Time</Label>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs font-normal">Start Time</Label>
            <Input
              type="time"
              value={formBreakStart}
              onChange={(e) => { const v = e.target.value; setFormBreakStart(v); if (v && formBreakEnd) setFormBreakTotalHours(computeBreakHours(v, formBreakEnd).toFixed(2)); }}
              disabled={formIsFlexible}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-normal">End Time</Label>
            <Input
              type="time"
              value={formBreakEnd}
              onChange={(e) => { const v = e.target.value; setFormBreakEnd(v); if (formBreakStart && v) setFormBreakTotalHours(computeBreakHours(formBreakStart, v).toFixed(2)); }}
              disabled={formIsFlexible}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-normal">Total Hours</Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              max="24"
              placeholder="e.g. 1"
              value={formBreakTotalHours}
              onChange={(e) => setFormBreakTotalHours(e.target.value)}
              disabled={formIsFlexible}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {formIsFlexible
            ? 'Disabled for flexible shifts to avoid fixed schedule confusion.'
            : 'Optional. Set start/end to auto-calculate total, or enter total hours directly.'}
        </p>
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
        <Label>
          Work Location <span className="text-red-500">*</span>
        </Label>
        <select
          value={formWorkLocationId}
          onChange={(e) => setFormWorkLocationId(e.target.value)}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Select a work location…
          </option>
          {workLocations.map((wl) => (
            <option key={wl.id} value={wl.id}>
              {wl.name}{wl.allow_anywhere ? ' (Anywhere)' : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Required. Employees are validated against this location on shift days (use an &quot;anywhere&quot; location for remote flex).
        </p>
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
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Shift Name</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Start Time</TableHead>
                  <TableHead>End Time</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="hidden lg:table-cell">Net Hrs</TableHead>
                  <TableHead className="hidden lg:table-cell">Break</TableHead>
                  <TableHead className="hidden xl:table-cell">Grace</TableHead>
                  <TableHead className="hidden md:table-cell">Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((shift) => (
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
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {shift.is_flexible ? '—' : formatTime(shift.start_time)}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {shift.is_flexible ? '—' : formatTime(shift.end_time)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {shift.work_location?.name || '—'}
                    </TableCell>
                    <TableCell className="text-sm font-medium hidden lg:table-cell">
                      {shift.is_flexible
                        ? `${shift.required_daily_hours ?? 8}h required`
                        : `${computeNetWorkingHours(
                            shift.start_time.substring(0, 5),
                            shift.end_time.substring(0, 5),
                            shift.break_total_hours ?? 0
                          )}h`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {shift.break_start_time && shift.break_end_time
                        ? `${formatTime(shift.break_start_time)}–${formatTime(shift.break_end_time)}`
                        : shift.break_total_hours != null
                        ? `${shift.break_total_hours}h`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm hidden xl:table-cell text-muted-foreground">
                      {shift.is_flexible ? '—' : shift.grace_period_minutes != null ? `${shift.grace_period_minutes}m` : '—'}
                    </TableCell>
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
                        <Button variant="ghost" size="icon" onClick={() => setViewingShift(shift)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(shift)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeletingShift(shift); setDeleteOpen(true); }} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No shifts found
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
      <Dialog open={!!viewingShift} onOpenChange={(open) => { if (!open) setViewingShift(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Shift Details
            </DialogTitle>
            <DialogDescription>{viewingShift?.name}</DialogDescription>
          </DialogHeader>
          {viewingShift && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewingShift.name}</p></div>
                <div><span className="text-muted-foreground text-sm">Schedule</span><p>{formatDays(viewingShift.days)}</p></div>
                <div><span className="text-muted-foreground text-sm">Mode</span><p>{viewingShift.is_flexible ? 'Flexible' : 'Fixed'}</p></div>
                <div><span className="text-muted-foreground text-sm">Required hours</span><p>{viewingShift.required_daily_hours ?? 8}h</p></div>
                <div><span className="text-muted-foreground text-sm">Start Time</span><p className="font-mono">{viewingShift.is_flexible ? '—' : formatTime(viewingShift.start_time)}</p></div>
                <div><span className="text-muted-foreground text-sm">End Time</span><p className="font-mono">{viewingShift.is_flexible ? '—' : formatTime(viewingShift.end_time)}</p></div>
                <div><span className="text-muted-foreground text-sm">Net Hours</span><p>{viewingShift.is_flexible ? `${viewingShift.required_daily_hours ?? 8}h required` : `${computeNetWorkingHours(viewingShift.start_time.substring(0, 5), viewingShift.end_time.substring(0, 5), viewingShift.break_total_hours ?? 0)}h`}</p></div>
                <div><span className="text-muted-foreground text-sm">Break</span><p>{viewingShift.break_start_time && viewingShift.break_end_time ? `${formatTime(viewingShift.break_start_time)} – ${formatTime(viewingShift.break_end_time)}` : viewingShift.break_total_hours != null ? `${viewingShift.break_total_hours}h` : '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Grace Period</span><p>{viewingShift.is_flexible ? '—' : viewingShift.grace_period_minutes != null ? `${viewingShift.grace_period_minutes} min` : '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Work Location</span><p>{viewingShift.work_location?.name || '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Status</span><p><Badge variant="outline" className={viewingShift.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}>{viewingShift.is_active ? 'Active' : 'Inactive'}</Badge></p></div>
              </div>
              {viewingShift.description && (
                <div><span className="text-muted-foreground text-sm">Description</span><p className="text-sm mt-1">{viewingShift.description}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingShift(null)}>Close</Button>
            <Button onClick={() => viewingShift && openEdit(viewingShift)} className="bg-primary hover:bg-primary/90 text-white">
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
