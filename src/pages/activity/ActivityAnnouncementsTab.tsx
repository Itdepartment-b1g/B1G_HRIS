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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, MessageCircle, CheckCircle, Calendar as CalendarIcon, Users, Pencil, Trash2, Download, Pin } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';
import { exportAcknowledgements } from '@/lib/exportAcknowledgements';
import { isImageUrl } from '@/lib/attachmentUtils';
import { createActivityInAppNotification } from '@/lib/inAppNotifications';
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
import { Checkbox } from '@/components/ui/checkbox';

interface AnnouncementRow {
  id: string;
  title: string;
  content: string;
  publish_date: string;
  expiration_date: string | null;
  attachment_url: string | null;
  is_pinned: boolean;
  target_audience: string;
  target_employee_ids?: string[];
  author: string;
  created_at: string;
  acknowledged: boolean;
}

const ActivityAnnouncementsTab = () => {
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const isAdmin = currentUser?.roles?.some((r) => ['super_admin', 'admin'].includes(r));

  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [acknowledging, setAcknowledgementing] = useState<string | null>(null);
  const [viewingAcks, setViewingAcks] = useState<{ id: string; title: string } | null>(null);
  const [ackList, setAckList] = useState<Array<{ employee_name: string; acknowledged_at: string }>>([]);
  const [exportLoadingId, setExportLoadingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    content: '',
    publish_date: format(new Date(), 'yyyy-MM-dd'),
    expiration_date: '',
    is_pinned: false,
    target_audience: 'all' as 'all' | 'selected',
    target_employee_ids: [] as string[],
  });
  const [employees, setEmployees] = useState<Array<{ id: string; first_name: string; last_name: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchAnnouncements = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data: annData } = await supabase
      .from('announcements')
      .select('id, title, content, publish_date, expiration_date, attachment_url, is_pinned, target_audience, target_employee_ids, created_at, author:employees!author_id(first_name, last_name)')
      .order('created_at', { ascending: false });

    const rows = (annData || []) as Array<{
      id: string;
      title: string;
      content: string;
      publish_date?: string;
      expiration_date?: string | null;
      attachment_url?: string | null;
      is_pinned?: boolean;
      target_audience?: string;
      target_employee_ids?: string[];
      created_at: string;
      author?: { first_name: string; last_name: string };
    }>;

    const filtered = isAdmin ? rows : rows.filter((a) => {
      const pub = a.publish_date || a.created_at?.slice(0, 10);
      if (pub && pub > today) return false;
      const exp = a.expiration_date;
      if (exp && exp < today) return false;
      if (a.target_audience === 'selected' && a.target_employee_ids?.length) {
        if (!a.target_employee_ids.includes(currentUser.id)) return false;
      }
      return true;
    });

    const { data: ackData } = await supabase
      .from('announcement_acknowledgements')
      .select('announcement_id')
      .eq('employee_id', currentUser.id);

    const ackedIds = new Set((ackData || []).map((x) => x.announcement_id));

    setAnnouncements(
      filtered.map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        publish_date: a.publish_date || a.created_at?.slice(0, 10) || today,
        expiration_date: a.expiration_date || null,
        attachment_url: a.attachment_url || null,
        is_pinned: a.is_pinned ?? false,
        target_audience: a.target_audience || 'all',
        target_employee_ids: a.target_employee_ids || [],
        author: a.author ? `${a.author.first_name} ${a.author.last_name}` : 'Unknown',
        created_at: a.created_at,
        acknowledged: ackedIds.has(a.id),
      }))
    );
  }, [currentUser?.id, today, isAdmin]);

  useEffect(() => {
    fetchAnnouncements().finally(() => setLoading(false));
  }, [fetchAnnouncements]);

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

  const handleAcknowledge = async (announcementId: string) => {
    if (!currentUser?.id) return;
    setAcknowledgementing(announcementId);
    const { error } = await supabase
      .from('announcement_acknowledgements')
      .insert({ announcement_id: announcementId, employee_id: currentUser.id });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Acknowledgement recorded.');
      fetchAnnouncements();
      refetchCompliance();
    }
    setAcknowledgementing(null);
  };

  const openCreate = (editRow?: AnnouncementRow) => {
    if (editRow) {
      setEditingId(editRow.id);
      setForm({
        title: editRow.title,
        content: editRow.content,
        publish_date: editRow.publish_date,
        expiration_date: editRow.expiration_date || '',
        is_pinned: editRow.is_pinned ?? false,
        target_audience: (editRow.target_audience || 'all') as 'all' | 'selected',
        target_employee_ids: editRow.target_employee_ids || [],
      });
    } else {
      setEditingId(null);
      setForm({ title: '', content: '', publish_date: format(new Date(), 'yyyy-MM-dd'), expiration_date: '', is_pinned: false, target_audience: 'all', target_employee_ids: [] });
    }
    setAttachmentFile(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!currentUser?.id || !form.title.trim() || !form.content.trim()) {
      toast.error('Title and message are required.');
      return;
    }
    setSubmitting(true);
    let attachmentUrl: string | undefined = undefined;
    if (attachmentFile) {
      const path = `${currentUser.id}/${Date.now()}_${attachmentFile.name}`;
      const { error: upErr } = await supabase.storage
        .from('announcement-attachments')
        .upload(path, attachmentFile, { upsert: false });
      if (upErr) {
        toast.error('Failed to upload attachment.');
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('announcement-attachments').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
    }
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      content: form.content.trim(),
      publish_date: form.publish_date,
      expiration_date: form.expiration_date || null,
      is_pinned: form.is_pinned,
      target_audience: form.target_audience,
      target_employee_ids: form.target_audience === 'selected' ? form.target_employee_ids : [],
    };
    if (attachmentUrl !== undefined) payload.attachment_url = attachmentUrl;

    if (editingId) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editingId);
      if (error) toast.error(error.message);
      else {
        createActivityInAppNotification({
          type: 'announcement',
          title: form.title.trim(),
          message: form.content.trim(),
          actionUrl: '/dashboard/activity',
          targetAudience: form.target_audience,
          targetEmployeeIds: form.target_audience === 'selected' ? form.target_employee_ids : [],
          metadata: { announcement_id: editingId },
          requiresAck: true,
        }).catch(() => {});
        toast.success('Announcement updated.');
        setCreateOpen(false);
        setEditingId(null);
        setForm({ title: '', content: '', publish_date: format(new Date(), 'yyyy-MM-dd'), expiration_date: '', is_pinned: false, target_audience: 'all', target_employee_ids: [] });
        setAttachmentFile(null);
        fetchAnnouncements();
        window.dispatchEvent(new CustomEvent('activity-popup-refetch'));
      }
    } else {
      (payload as any).author_id = currentUser.id;
      const { data: createdRow, error } = await supabase.from('announcements').insert(payload).select('id').single();
      if (error) toast.error(error.message);
      else {
        createActivityInAppNotification({
          type: 'announcement',
          title: form.title.trim(),
          message: form.content.trim(),
          actionUrl: '/dashboard/activity',
          targetAudience: form.target_audience,
          targetEmployeeIds: form.target_audience === 'selected' ? form.target_employee_ids : [],
          metadata: { announcement_id: createdRow?.id ?? null },
          requiresAck: true,
        }).catch(() => {});
        toast.success('Announcement created.');
        setCreateOpen(false);
        setForm({ title: '', content: '', publish_date: format(new Date(), 'yyyy-MM-dd'), expiration_date: '', is_pinned: false, target_audience: 'all', target_employee_ids: [] });
        setAttachmentFile(null);
        fetchAnnouncements();
        window.dispatchEvent(new CustomEvent('activity-popup-refetch'));
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Announcement deleted.');
      setDeleteId(null);
      fetchAnnouncements();
    }
  };

  const fetchAcknowledgements = async (announcementId: string) => {
    const { data } = await supabase
      .from('announcement_acknowledgements')
      .select('acknowledged_at, employee:employees!employee_id(first_name, last_name)')
      .eq('announcement_id', announcementId)
      .order('acknowledged_at', { ascending: false });
    setAckList(
      (data || []).map((x: any) => ({
        employee_name: x.employee ? `${x.employee.first_name} ${x.employee.last_name}` : 'Unknown',
        acknowledged_at: x.acknowledged_at,
      }))
    );
  };

  const handleExportAcknowledgements = async (announcementId: string, title: string, format: 'pdf' | 'csv' | 'xlsx') => {
    setExportLoadingId(announcementId);
    try {
      const { data } = await supabase
        .from('announcement_acknowledgements')
        .select('acknowledged_at, employee:employees!employee_id(first_name, last_name)')
        .eq('announcement_id', announcementId)
        .order('acknowledged_at', { ascending: false });
      const items = (data || []).map((x: any) => ({
        employee_name: x.employee ? `${x.employee.first_name} ${x.employee.last_name}` : 'Unknown',
        acknowledged_at: x.acknowledged_at,
      }));
      exportAcknowledgements({ items, title: `Announcement: ${title}`, format });
      toast.success(`Acknowledgements exported as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export acknowledgements');
    } finally {
      setExportLoadingId(null);
    }
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
            Create Announcement
          </Button>
        </div>
      )}
      <div className="space-y-4">
        {announcements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No announcements at this time.</p>
            </CardContent>
          </Card>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    {a.is_pinned && <Pin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {a.title}
                  </CardTitle>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.acknowledged ? (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        Acknowledged
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleAcknowledge(a.id)}
                        disabled={!!acknowledging}
                      >
                        {acknowledging === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        I Understand
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setViewingAcks({ id: a.id, title: a.title });
                            fetchAcknowledgements(a.id);
                            setAckDialogOpen(true);
                          }}
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={exportLoadingId === a.id}>
                              {exportLoadingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleExportAcknowledgements(a.id, a.title, 'pdf')}>Export PDF</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExportAcknowledgements(a.id, a.title, 'csv')}>Export CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExportAcknowledgements(a.id, a.title, 'xlsx')}>Export XLSX</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="outline" size="sm" onClick={() => openCreate(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteId(a.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <CalendarIcon className="h-3 w-3" />
                  {a.publish_date}
                  {a.expiration_date && ` – ${a.expiration_date}`}
                  <span className="ml-2">By {a.author}</span>
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                {a.attachment_url && (
                  isImageUrl(a.attachment_url) ? (
                    <div className="mt-3">
                      <img src={a.attachment_url} alt="Attachment" className="max-w-full max-h-64 rounded-lg border object-contain" />
                    </div>
                  ) : (
                    <a
                      href={a.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-sm mt-2 inline-block hover:underline flex items-center gap-1"
                    >
                      View attachment
                    </a>
                  )
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Announcement' : 'Create Announcement'}</DialogTitle>
            <DialogDescription>Publish a company announcement. Employees will see it on login and must acknowledge.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Announcement title"
              />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Main content"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Publish Date</Label>
                <Input
                  type="date"
                  value={form.publish_date}
                  onChange={(e) => setForm((f) => ({ ...f, publish_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Expiration Date (optional)</Label>
                <Input
                  type="date"
                  value={form.expiration_date}
                  onChange={(e) => setForm((f) => ({ ...f, expiration_date: e.target.value }))}
                />
              </div>
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
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_pinned"
                checked={form.is_pinned}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_pinned: !!checked }))}
              />
              <label htmlFor="is_pinned" className="text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5">
                <Pin className="h-4 w-4 text-muted-foreground" />
                Pin to top of feed
              </label>
            </div>
            <div>
              <Label>Attachment (optional)</Label>
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
              {editingId ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
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

export default ActivityAnnouncementsTab;
