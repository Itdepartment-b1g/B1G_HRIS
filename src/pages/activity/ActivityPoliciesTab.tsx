import { useState, useEffect, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, FileText, CheckCircle, Calendar as CalendarIcon, Users, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PolicyRow {
  id: string;
  title: string;
  description: string;
  effective_date: string;
  attachment_url: string | null;
  target_audience: string;
  target_employee_ids?: string[];
  author: string;
  created_at: string;
  acknowledged: boolean;
}

const ActivityPoliciesTab = () => {
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const isAdmin = currentUser?.roles?.some((r) => ['super_admin', 'admin'].includes(r));

  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [acknowledging, setAcknowledgementing] = useState<string | null>(null);
  const [viewingAcks, setViewingAcks] = useState<{ id: string; title: string } | null>(null);
  const [ackList, setAckList] = useState<Array<{ employee_name: string; acknowledged_at: string }>>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    effective_date: format(new Date(), 'yyyy-MM-dd'),
    target_audience: 'all' as 'all' | 'selected',
    target_employee_ids: [] as string[],
  });
  const [employees, setEmployees] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchPolicies = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data: polData } = await supabase
      .from('policies')
      .select('id, title, description, effective_date, attachment_url, target_audience, target_employee_ids, created_at, author:employees!author_id(first_name, last_name)')
      .order('created_at', { ascending: false });

    const rows = (polData || []) as Array<{
      id: string;
      title: string;
      description: string;
      effective_date: string;
      attachment_url?: string | null;
      target_audience?: string;
      target_employee_ids?: string[];
      created_at: string;
      author?: { first_name: string; last_name: string };
    }>;

    const filtered = isAdmin ? rows : rows.filter((p) => {
      if (p.effective_date > today) return false;
      if (p.target_audience === 'selected' && p.target_employee_ids?.length) {
        if (!p.target_employee_ids.includes(currentUser.id)) return false;
      }
      return true;
    });

    const { data: ackData } = await supabase
      .from('policy_acknowledgements')
      .select('policy_id')
      .eq('employee_id', currentUser.id);

    const ackedIds = new Set((ackData || []).map((x) => x.policy_id));

    setPolicies(
      filtered.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        effective_date: p.effective_date,
        attachment_url: p.attachment_url || null,
        target_audience: p.target_audience || 'all',
        target_employee_ids: p.target_employee_ids || [],
        author: p.author ? `${p.author.first_name} ${p.author.last_name}` : 'Unknown',
        created_at: p.created_at,
        acknowledged: ackedIds.has(p.id),
      }))
    );
  }, [currentUser?.id, today, isAdmin]);

  useEffect(() => {
    fetchPolicies().finally(() => setLoading(false));
  }, [fetchPolicies]);

  useEffect(() => {
    if (isAdmin) {
      supabase
        .from('employees')
        .select('id, first_name, last_name')
        .eq('is_active', true)
        .order('first_name')
        .then(({ data }) => setEmployees(data || []));
    }
  }, [isAdmin]);

  const handleAcknowledge = async (policyId: string) => {
    if (!currentUser?.id) return;
    setAcknowledgementing(policyId);
    const { error } = await supabase
      .from('policy_acknowledgements')
      .insert({ policy_id: policyId, employee_id: currentUser.id });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Acknowledgement recorded.');
      fetchPolicies();
      refetchCompliance();
    }
    setAcknowledgementing(null);
  };

  const openCreate = (editRow?: PolicyRow) => {
    if (editRow) {
      setEditingId(editRow.id);
      setForm({
        title: editRow.title,
        description: editRow.description,
        effective_date: editRow.effective_date,
        target_audience: (editRow.target_audience || 'all') as 'all' | 'selected',
        target_employee_ids: editRow.target_employee_ids || [],
      });
    } else {
      setEditingId(null);
      setForm({ title: '', description: '', effective_date: format(new Date(), 'yyyy-MM-dd'), target_audience: 'all', target_employee_ids: [] });
    }
    setAttachmentFile(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!currentUser?.id || !form.title.trim() || !form.description.trim()) {
      toast.error('Title and description are required.');
      return;
    }
    setSubmitting(true);
    let attachmentUrl: string | undefined = undefined;
    if (attachmentFile) {
      const path = `${currentUser.id}/${Date.now()}_${attachmentFile.name}`;
      const { error: upErr } = await supabase.storage
        .from('policy-attachments')
        .upload(path, attachmentFile, { upsert: false });
      if (upErr) {
        toast.error('Failed to upload attachment.');
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('policy-attachments').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      effective_date: form.effective_date,
      target_audience: form.target_audience,
      target_employee_ids: form.target_audience === 'selected' ? form.target_employee_ids : [],
    };
    if (attachmentUrl !== undefined) payload.attachment_url = attachmentUrl;

    if (editingId) {
      const { error } = await supabase.from('policies').update(payload).eq('id', editingId);
      if (error) toast.error(error.message);
      else {
        toast.success('Policy updated.');
        setCreateOpen(false);
        setEditingId(null);
        setForm({ title: '', description: '', effective_date: format(new Date(), 'yyyy-MM-dd'), target_audience: 'all', target_employee_ids: [] });
        setAttachmentFile(null);
        fetchPolicies();
      }
    } else {
      (payload as any).author_id = currentUser.id;
      const { error } = await supabase.from('policies').insert(payload);
      if (error) toast.error(error.message);
      else {
        toast.success('Policy published.');
        setCreateOpen(false);
        setForm({ title: '', description: '', effective_date: format(new Date(), 'yyyy-MM-dd'), target_audience: 'all', target_employee_ids: [] });
        setAttachmentFile(null);
        fetchPolicies();
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('policies').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Policy deleted.');
      setDeleteId(null);
      fetchPolicies();
    }
  };

  const fetchAcknowledgements = async (policyId: string) => {
    const { data } = await supabase
      .from('policy_acknowledgements')
      .select('acknowledged_at, employee:employees!employee_id(first_name, last_name)')
      .eq('policy_id', policyId)
      .order('acknowledged_at', { ascending: false });
    setAckList(
      (data || []).map((x: any) => ({
        employee_name: x.employee ? `${x.employee.first_name} ${x.employee.last_name}` : 'Unknown',
        acknowledged_at: x.acknowledged_at,
      }))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-start">
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            Publish Policy
          </Button>
        </div>
      )}
      <div className="space-y-4">
        {policies.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No policies at this time.</p>
            </CardContent>
          </Card>
        ) : (
          policies.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base">{p.title}</CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.acknowledged ? (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        Acknowledged
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAcknowledge(p.id)}
                        disabled={!!acknowledging}
                      >
                        {acknowledging === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        I Acknowledge
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setViewingAcks({ id: p.id, title: p.title });
                            fetchAcknowledgements(p.id);
                            setAckDialogOpen(true);
                          }}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openCreate(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteId(p.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <CalendarIcon className="h-3 w-3" />
                  Effective {p.effective_date}
                  <span className="ml-2">By {p.author}</span>
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
                {p.attachment_url && (
                  <a
                    href={p.attachment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary text-sm mt-2 inline-block hover:underline"
                  >
                    View policy document
                  </a>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Policy' : 'Publish Policy'}</DialogTitle>
            <DialogDescription>Publish a company policy. Employees must acknowledge to read it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Policy Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Policy name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Policy details"
                rows={4}
              />
            </div>
            <div>
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={form.effective_date}
                onChange={(e) => setForm((f) => ({ ...f, effective_date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Target Audience</Label>
              <Select
                value={form.target_audience}
                onValueChange={(v) => setForm((f) => ({ ...f, target_audience: v as 'all' | 'selected' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  <SelectItem value="selected">Selected employees</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.target_audience === 'selected' && (
              <div>
                <Label>Select Employees</Label>
                <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-2">
                  {employees.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.target_employee_ids.includes(e.id)}
                        onChange={() =>
                          setForm((f) =>
                            f.target_employee_ids.includes(e.id)
                              ? { ...f, target_employee_ids: f.target_employee_ids.filter((id) => id !== e.id) }
                              : { ...f, target_employee_ids: [...f.target_employee_ids, e.id] }
                          )
                        }
                        className="rounded"
                      />
                      <span className="text-sm">{e.first_name} {e.last_name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Selected: {form.target_employee_ids.length}</p>
              </div>
            )}
            <div>
              <Label>Policy Document (optional)</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Update' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete policy?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Acknowledgements will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={ackDialogOpen} onOpenChange={setAckDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Who has acknowledged</DialogTitle>
            <DialogDescription>{viewingAcks?.title}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ackList.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.employee_name}</TableCell>
                  <TableCell>{new Date(item.acknowledged_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {ackList.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No acknowledgements yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivityPoliciesTab;
