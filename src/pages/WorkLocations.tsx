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
import { MapPin, Plus, Pencil, Trash2, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';

interface Location {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  allow_anywhere: boolean;
  is_active: boolean;
  created_at: string;
}

const WorkLocations = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLng, setFormLng] = useState('');
  const [formRadius, setFormRadius] = useState('100');
  const [formAllowAnywhere, setFormAllowAnywhere] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [viewing, setViewing] = useState<Location | null>(null);
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('work_locations').select('*').order('name');
    if (error) { toast.error('Failed to load'); console.error(error); }
    else setLocations(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = locations;
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const reset = () => {
    setFormName(''); setFormAddress(''); setFormLat(''); setFormLng('');
    setFormRadius('100'); setFormAllowAnywhere(false); setFormIsActive(true);
  };

  const buildPayload = () => ({
    name: formName.trim(),
    address: formAddress.trim() || null,
    latitude: formLat ? parseFloat(formLat) : null,
    longitude: formLng ? parseFloat(formLng) : null,
    radius_meters: formRadius ? parseInt(formRadius) : 100,
    allow_anywhere: formAllowAnywhere,
    is_active: formIsActive,
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('work_locations').insert(buildPayload());
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" created`); setAddOpen(false); reset(); fetchData(); }
    setSaving(false);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setFormName(loc.name);
    setFormAddress(loc.address || '');
    setFormLat(loc.latitude?.toString() || '');
    setFormLng(loc.longitude?.toString() || '');
    setFormRadius(loc.radius_meters?.toString() || '100');
    setFormAllowAnywhere(loc.allow_anywhere);
    setFormIsActive(loc.is_active);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('work_locations').update(buildPayload()).eq('id', editing.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${formName}" updated`); setEditOpen(false); setEditing(null); reset(); fetchData(); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.from('work_locations').delete().eq('id', deleting.id);
    if (error) toast.error(error.message);
    else { toast.success(`"${deleting.name}" deleted`); setDeleteOpen(false); setDeleting(null); fetchData(); }
    setSaving(false);
  };

  const renderForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Location Name <span className="text-red-500">*</span></Label>
        <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Main Office, Remote" required />
      </div>
      <div className="space-y-2">
        <Label>Address</Label>
        <Textarea value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Full address (optional)" rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Latitude</Label>
          <Input type="number" step="any" value={formLat} onChange={(e) => setFormLat(e.target.value)} placeholder="e.g. 14.5995" />
        </div>
        <div className="space-y-2">
          <Label>Longitude</Label>
          <Input type="number" step="any" value={formLng} onChange={(e) => setFormLng(e.target.value)} placeholder="e.g. 120.9842" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Radius (meters)</Label>
        <Input type="number" min="10" value={formRadius} onChange={(e) => setFormRadius(e.target.value)} placeholder="100" />
        <p className="text-xs text-muted-foreground">How far from coordinates an employee can be to time in/out.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="wl-anywhere"
          checked={formAllowAnywhere}
          onChange={(e) => setFormAllowAnywhere(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <Label htmlFor="wl-anywhere" className="cursor-pointer">Allow time in/out from anywhere</Label>
      </div>
      <p className="text-xs text-muted-foreground -mt-2 ml-6">
        When enabled, employees at this location can clock in/out regardless of their GPS position.
      </p>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="wl-active" checked={formIsActive} onChange={(e) => setFormIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
        <Label htmlFor="wl-active" className="cursor-pointer">Active</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Work Locations</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage office locations with geofencing for attendance</p>
        </div>
        <Button onClick={() => { reset(); setAddOpen(true); }} className="bg-primary hover:bg-primary/90 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Location
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            All Locations ({filtered.length})
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
                  <TableHead className="hidden md:table-cell">Address</TableHead>
                  <TableHead className="hidden lg:table-cell">Coordinates</TableHead>
                  <TableHead className="hidden lg:table-cell">Radius</TableHead>
                  <TableHead>Geo-lock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium text-sm">{loc.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{loc.address || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell font-mono">
                      {loc.latitude && loc.longitude ? `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{loc.radius_meters ? `${loc.radius_meters}m` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={loc.allow_anywhere ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-orange-50 text-orange-700 border-orange-200'}>
                        {loc.allow_anywhere ? 'Anywhere' : 'Restricted'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={loc.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}>
                        {loc.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setViewing(loc)} title="View"><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(loc)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleting(loc); setDeleteOpen(true); }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No work locations found</TableCell></TableRow>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Location Details
            </DialogTitle>
            <DialogDescription>{viewing?.name}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><span className="text-muted-foreground text-sm">Name</span><p className="font-medium">{viewing.name}</p></div>
                <div className="col-span-2"><span className="text-muted-foreground text-sm">Address</span><p className="text-sm">{viewing.address || '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Latitude</span><p>{viewing.latitude ?? '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Longitude</span><p>{viewing.longitude ?? '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Radius</span><p>{viewing.radius_meters ? `${viewing.radius_meters}m` : '—'}</p></div>
                <div><span className="text-muted-foreground text-sm">Geo-lock</span><p><Badge variant="outline" className={viewing.allow_anywhere ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}>{viewing.allow_anywhere ? 'Anywhere' : 'Restricted'}</Badge></p></div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> Add Work Location</DialogTitle>
            <DialogDescription>Create a new work location with geofencing settings.</DialogDescription>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5 text-primary" /> Edit Location</DialogTitle>
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
          <AlertDialogHeader><AlertDialogTitle>Delete Location</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleting?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmDelete} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkLocations;
