import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface LeaveTypeConfig {
  id: string;
  code: string;
  name: string;
  description: string | null;
  annual_entitlement: number;
  resets_on_jan1: boolean;
  cap: number | null;
  sort_order: number;
  is_system: boolean;
  created_at: string;
}

interface LeaveTypeEligibility {
  id: string;
  leave_type_config_id: string;
  employment_status_id: string;
  gender_filter: 'all' | 'male' | 'female';
  employment_status?: { name: string };
}

interface EmploymentStatus {
  id: string;
  name: string;
}

const GENDER_LABELS: Record<string, string> = {
  all: 'All Genders',
  male: 'Male Only',
  female: 'Female Only',
};

const LeaveBalances = () => {
  const [configs, setConfigs] = useState<LeaveTypeConfig[]>([]);
  const [eligibility, setEligibility] = useState<LeaveTypeEligibility[]>([]);
  const [employmentStatuses, setEmploymentStatuses] = useState<EmploymentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEntitlement, setFormEntitlement] = useState('');
  const [formResets, setFormResets] = useState(true);
  const [formCap, setFormCap] = useState('');
  const [formEligibility, setFormEligibility] = useState<Array<{ employment_status_id: string; gender_filter: string }>>([]);
  const [editing, setEditing] = useState<LeaveTypeConfig | null>(null);
  const [viewing, setViewing] = useState<LeaveTypeConfig | null>(null);
  const [deleting, setDeleting] = useState<LeaveTypeConfig | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [configRes, eligRes, statusRes] = await Promise.all([
      supabase.from('leave_type_config').select('*').order('sort_order'),
      supabase.from('leave_type_eligibility').select('*, employment_statuses!employment_status_id(name)'),
      supabase.from('employment_statuses').select('id, name').order('name'),
    ]);
    if (configRes.error) {
      toast.error('Failed to load leave types');
      setConfigs([]);
    } else {
      setConfigs(configRes.data || []);
    }
    if (eligRes.error) {
      setEligibility([]);
    } else {
      setEligibility(
        (eligRes.data || []).map((r: any) => ({
          ...r,
          employment_status: r.employment_statuses || r.employment_status,
        }))
      );
    }
    if (statusRes.error) {
      setEmploymentStatuses([]);
    } else {
      setEmploymentStatuses(statusRes.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = configs;
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const getEligibilityForConfig = (configId: string) =>
    eligibility.filter((e) => e.leave_type_config_id === configId);

  const resetForm = () => {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormEntitlement('');
    setFormResets(true);
    setFormCap('');
    setFormEligibility([]);
  };

  const openAdd = () => {
    resetForm();
    setAddOpen(true);
  };

  const openEdit = (c: LeaveTypeConfig) => {
    setEditing(c);
    setFormCode(c.code);
    setFormName(c.name);
    setFormDescription(c.description || '');
    setFormEntitlement(String(c.annual_entitlement));
    setFormResets(c.resets_on_jan1);
    setFormCap(c.cap != null ? String(c.cap) : '');
    const elig = getEligibilityForConfig(c.id).map((e) => ({
      employment_status_id: e.employment_status_id,
      gender_filter: e.gender_filter,
    }));
    setFormEligibility(elig.length > 0 ? elig : [{ employment_status_id: '', gender_filter: 'all' }]);
    setEditOpen(true);
  };

  const openView = (c: LeaveTypeConfig) => {
    setViewing(c);
    setViewOpen(true);
  };

  const addEligibilityRow = () => {
    setFormEligibility((prev) => [...prev, { employment_status_id: '', gender_filter: 'all' }]);
  };

  const removeEligibilityRow = (idx: number) => {
    setFormEligibility((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEligibilityRow = (idx: number, field: 'employment_status_id' | 'gender_filter', value: string) => {
    setFormEligibility((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCode.trim() || !formName.trim()) {
      toast.error('Code and name are required');
      return;
    }
    const entitlement = parseFloat(formEntitlement);
    if (isNaN(entitlement) || entitlement < 0) {
      toast.error('Enter a valid annual entitlement');
      return;
    }
    setSaving(true);
    const { data: inserted, error: insertErr } = await supabase
      .from('leave_type_config')
      .insert({
        code: formCode.trim().toLowerCase(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        annual_entitlement: entitlement,
        resets_on_jan1: formResets,
        cap: formCap.trim() ? parseFloat(formCap) : null,
        sort_order: configs.length + 1,
        is_system: false,
      })
      .select('id')
      .single();
    if (insertErr) {
      toast.error(insertErr.message);
      setSaving(false);
      return;
    }
    const validElig = formEligibility.filter((e) => e.employment_status_id);
    if (validElig.length > 0 && inserted?.id) {
      await supabase.from('leave_type_eligibility').insert(
        validElig.map((e) => ({
          leave_type_config_id: inserted.id,
          employment_status_id: e.employment_status_id,
          gender_filter: e.gender_filter,
        }))
      );
    }
    toast.success(`"${formName}" created`);
    setAddOpen(false);
    resetForm();
    fetchData();
    setSaving(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !formCode.trim() || !formName.trim()) return;
    const entitlement = parseFloat(formEntitlement);
    if (isNaN(entitlement) || entitlement < 0) {
      toast.error('Enter a valid annual entitlement');
      return;
    }
    setSaving(true);
    const { error: updateErr } = await supabase
      .from('leave_type_config')
      .update({
        code: formCode.trim().toLowerCase(),
        name: formName.trim(),
        description: formDescription.trim() || null,
        annual_entitlement: entitlement,
        resets_on_jan1: formResets,
        cap: formCap.trim() ? parseFloat(formCap) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editing.id);
    if (updateErr) {
      toast.error(updateErr.message);
      setSaving(false);
      return;
    }
    await supabase.from('leave_type_eligibility').delete().eq('leave_type_config_id', editing.id);
    const validElig = formEligibility.filter((e) => e.employment_status_id);
    if (validElig.length > 0) {
      await supabase.from('leave_type_eligibility').insert(
        validElig.map((e) => ({
          leave_type_config_id: editing.id,
          employment_status_id: e.employment_status_id,
          gender_filter: e.gender_filter,
        }))
      );
    }
    toast.success(`"${formName}" updated`);
    setEditOpen(false);
    setEditing(null);
    resetForm();
    fetchData();
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (deleting.is_system) {
      toast.error('System leave types cannot be deleted');
      setDeleteOpen(false);
      setDeleting(null);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('leave_type_config').delete().eq('id', deleting.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`"${deleting.name}" deleted`);
      setDeleteOpen(false);
      setDeleting(null);
      fetchData();
    }
    setSaving(false);
  };

  const renderForm = (isEdit: boolean) => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="form-code">Code <span className="text-red-500">*</span></Label>
          <Input
            id="form-code"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value)}
            placeholder="e.g. vl, sl, maternity"
            disabled={isEdit}
            className="font-mono w-full"
          />
          <p className="text-xs text-muted-foreground">Unique short code (lowercase, no spaces)</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-name">Name <span className="text-red-500">*</span></Label>
          <Input
            id="form-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Vacation Leave"
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="form-desc">Description</Label>
        <Textarea
          id="form-desc"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Optional description"
          rows={2}
          className="resize-none w-full"
        />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="form-entitlement">Annual Entitlement (days)</Label>
            <Input
              id="form-entitlement"
              type="number"
              min="0"
              step="0.5"
              value={formEntitlement}
              onChange={(e) => setFormEntitlement(e.target.value)}
              placeholder="15"
              className="w-full h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-cap">Cap (max balance)</Label>
            <Input
              id="form-cap"
              type="number"
              min="0"
              step="0.5"
              value={formCap}
              onChange={(e) => setFormCap(e.target.value)}
              placeholder="No cap"
              className="w-full h-10"
            />
          </div>
          <div className="space-y-2">
            <Label>Options</Label>
            <div className="flex items-center h-10">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={formResets}
                  onChange={(e) => setFormResets(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary shrink-0"
                />
                Resets on Jan 1
              </label>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          When &quot;Resets on Jan 1&quot; is checked, the annual entitlement is credited each year. Cap limits the maximum balance (leave blank for no limit).
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label>Eligibility (Employment Status + Gender)</Label>
          <Button type="button" variant="outline" size="sm" onClick={addEligibilityRow}>
            <Plus className="h-4 w-4 mr-1.5" /> Add
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Who gets this leave type. Add rows for each employment status + gender combination.
        </p>
        <div className="space-y-2 max-h-40 overflow-y-auto rounded-md border p-3 bg-muted/30">
          {formEligibility.map((row, idx) => (
            <div key={idx} className="flex gap-3 items-center">
              <Select
                value={row.employment_status_id}
                onValueChange={(v) => updateEligibilityRow(idx, 'employment_status_id', v)}
              >
                <SelectTrigger className="flex-1 min-w-0">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {employmentStatuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.gender_filter}
                onValueChange={(v) => updateEligibilityRow(idx, 'gender_filter', v)}
              >
                <SelectTrigger className="w-[140px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Genders</SelectItem>
                  <SelectItem value="male">Male Only</SelectItem>
                  <SelectItem value="female">Female Only</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-red-600 shrink-0"
                onClick={() => removeEligibilityRow(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave Balances</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure leave types, entitlements, caps, and who is eligible by employment status and gender.
          </p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Leave Type
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Leave Type Configurations ({filtered.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Annual entitlement is credited each Jan 1 when enabled. Cap limits max balance. Eligibility defines which employment statuses and genders receive this leave.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Entitlement</TableHead>
                    <TableHead>Resets Jan 1</TableHead>
                    <TableHead>Cap</TableHead>
                    <TableHead>Eligible</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => {
                    const elig = getEligibilityForConfig(c.id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-medium">{c.code}</TableCell>
                        <TableCell>
                          {c.name}
                          {c.is_system && (
                            <Badge variant="outline" className="ml-1.5 text-xs">System</Badge>
                          )}
                        </TableCell>
                        <TableCell>{c.annual_entitlement} days</TableCell>
                        <TableCell>{c.resets_on_jan1 ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{c.cap != null ? c.cap : '—'}</TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          {elig.length === 0 ? (
                            <span className="text-muted-foreground">None</span>
                          ) : (
                            elig.map((e) => {
                              const es = (e as any).employment_status || (e as any).employment_statuses;
                              return (
                                <span
                                  key={e.id}
                                  className="inline-block bg-muted px-1.5 py-0.5 rounded mr-1 mb-0.5"
                                >
                                  {es?.name || '?'} • {GENDER_LABELS[e.gender_filter]}
                                </span>
                              );
                            })
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openView(c)} title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {!c.is_system && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  setDeleting(c);
                                  setDeleteOpen(true);
                                }}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No leave types configured. Add one to get started.
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
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Leave Type Details
            </DialogTitle>
            <DialogDescription>{viewing?.name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Code</span><p className="font-mono font-medium">{viewing.code}</p></div>
                <div><span className="text-muted-foreground">Name</span><p className="font-medium">{viewing.name}</p></div>
                <div><span className="text-muted-foreground">Annual Entitlement</span><p>{viewing.annual_entitlement} days</p></div>
                <div><span className="text-muted-foreground">Resets on Jan 1</span><p>{viewing.resets_on_jan1 ? 'Yes' : 'No'}</p></div>
                <div><span className="text-muted-foreground">Cap</span><p>{viewing.cap != null ? viewing.cap : 'No cap'}</p></div>
              </div>
              {viewing.description && (
                <div><span className="text-muted-foreground text-sm">Description</span><p className="text-sm mt-0.5">{viewing.description}</p></div>
              )}
              <div>
                <span className="text-muted-foreground text-sm">Eligibility</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {getEligibilityForConfig(viewing.id).length === 0 ? (
                    <p className="text-sm text-muted-foreground">None</p>
                  ) : (
                    getEligibilityForConfig(viewing.id).map((e) => {
                      const es = (e as any).employment_status || (e as any).employment_statuses;
                      return (
                        <Badge key={e.id} variant="outline">
                          {es?.name || '?'} • {GENDER_LABELS[e.gender_filter]}
                        </Badge>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewOpen(false)}>Close</Button>
            <Button onClick={() => viewing && openEdit(viewing)} className="bg-primary hover:bg-primary/90 text-white">
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Add Leave Type
            </DialogTitle>
            <DialogDescription>Define a new leave type with entitlement, reset rules, and eligibility.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd}>
            {renderForm(false)}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" /> Edit Leave Type
            </DialogTitle>
            <DialogDescription>Update &quot;{editing?.name}&quot;.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            {renderForm(true)}
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleting?.name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LeaveBalances;
