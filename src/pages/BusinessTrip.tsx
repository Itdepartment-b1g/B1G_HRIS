import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TablePagination, PAGE_SIZE } from '@/components/TablePagination';
import { Loader2, Plus, Briefcase, Eye, Paperclip, MapPin, CalendarDays, ClipboardList, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';
import type { BusinessTrip, TripType } from '@/types';
import BusinessTripApprovals from './BusinessTripApprovals';

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'work_visit_domestic', label: 'Work Visit (Domestic)' },
  { value: 'work_visit_overseas', label: 'Work Visit (Overseas)' },
  { value: 'training', label: 'Training' },
];

const TRIP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TRIP_TYPES.map((t) => [t.value, t.label])
);

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const BusinessTrip = () => {
  const { user: currentUser } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [mainTab, setMainTab] = useState<'trips' | 'approval'>(() =>
    tabParam === 'approval' ? 'approval' : 'trips'
  );
  useEffect(() => {
    if (tabParam === 'approval') setMainTab('approval');
  }, [tabParam]);

  const [myTrips, setMyTrips] = useState<BusinessTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileDialogOpen, setFileDialogOpen] = useState(false);
  const [viewingTrip, setViewingTrip] = useState<BusinessTrip | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tripPage, setTripPage] = useState(1);
  const [tripAttachmentFile, setTripAttachmentFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    trip_type: 'work_visit_domestic' as TripType,
    location: '',
    purpose: '',
    start_date: '',
    end_date: '',
  });

  const fetchMyTrips = useCallback(async () => {
    if (!currentUser?.id) return;
    const { data } = await supabase
      .from('business_trips')
      .select('*, approver:employees!approved_by(first_name, last_name)')
      .eq('employee_id', currentUser.id)
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    const withApprover = (data || []).map((r: Record<string, unknown>) => ({
      ...r,
      approver_name:
        r.approver && typeof r.approver === 'object' && 'first_name' in r.approver && 'last_name' in r.approver
          ? `${(r.approver as { first_name: string }).first_name} ${(r.approver as { last_name: string }).last_name}`
          : null,
    }));
    setMyTrips(withApprover as BusinessTrip[]);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    setLoading(true);
    fetchMyTrips().finally(() => setLoading(false));
  }, [currentUser?.id, fetchMyTrips]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel('business-trip-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'business_trips',
          filter: `employee_id=eq.${currentUser.id}`,
        },
        () => fetchMyTrips()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchMyTrips]);

  const paginatedTrips = useMemo(() => {
    const start = (tripPage - 1) * PAGE_SIZE;
    return myTrips.slice(start, start + PAGE_SIZE);
  }, [myTrips, tripPage]);

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
    if (!form.trip_type) {
      toast.error('Trip type is required');
      return;
    }
    if (!form.location?.trim()) {
      toast.error('Location is required');
      return;
    }
    if (!form.purpose?.trim()) {
      toast.error('Purpose is required');
      return;
    }
    if (!form.start_date || !form.end_date) {
      toast.error('Please select start and end dates');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('End date must be on or after start date');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentUrl: string | null = null;
      if (tripAttachmentFile) {
        const ext = tripAttachmentFile.name.split('.').pop() || 'pdf';
        const path = `${currentUser.id}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('trip-attachments')
          .upload(path, tripAttachmentFile, { upsert: false });
        if (uploadErr) {
          toast.error('Failed to upload attachment. Try again.');
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from('trip-attachments').getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }

      const { data } = await supabase.rpc('validate_and_submit_trip', {
        p_trip_type: form.trip_type,
        p_location: form.location.trim(),
        p_purpose: form.purpose.trim(),
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_attachment_url: attachmentUrl,
      });

      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Business trip request submitted successfully');
        if (result.id) {
          sendRequestNotification({ event: 'submitted', requestType: 'business_trip', requestId: result.id }).catch(() => {});
          createRequestInAppNotification({ event: 'submitted', requestType: 'business_trip', requestId: result.id }).catch(() => {});
        }
        setFileDialogOpen(false);
        setForm({
          trip_type: 'work_visit_domestic',
          location: '',
          purpose: '',
          start_date: '',
          end_date: '',
        });
        setTripAttachmentFile(null);
        fetchMyTrips();
      } else {
        toast.error(result?.error || 'Failed to submit business trip request');
      }
    } catch {
      toast.error('Failed to submit business trip request');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  if (loading && myTrips.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canApprove = currentUser?.roles?.some((r) =>
    ['super_admin', 'admin', 'supervisor', 'manager'].includes(r)
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">
          {mainTab === 'approval' ? 'Business Trip Approvals' : 'Business Trip Management'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {mainTab === 'approval'
            ? 'Review and approve business trip requests from your team members'
            : 'File business trip requests and track approval status'}
        </p>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 mt-4">
        <aside className="hidden lg:flex flex-col w-64 shrink-0 min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center gap-3 px-4 py-4 mb-2 rounded-xl bg-primary/5 border border-primary/10">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground text-sm leading-tight">
                {mainTab === 'approval' ? 'Business Trip Approvals' : 'Business Trip Management'}
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                {mainTab === 'approval' ? 'Review team requests' : 'My trip requests'}
              </p>
            </div>
          </div>

          {/* My Trips | Approval tabs - same as Leave */}
          {canApprove && (
            <div className="flex rounded-lg bg-muted p-0.5 mb-3">
              <button
                onClick={() => {
                  setMainTab('trips');
                  setSearchParams({});
                }}
                className={cn(
                  'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                  mainTab === 'trips'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                My Trips
              </button>
              <button
                onClick={() => {
                  setMainTab('approval');
                  setSearchParams({ tab: 'approval' });
                }}
                className={cn(
                  'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                  mainTab === 'approval'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Approval
              </button>
            </div>
          )}

          {/* Sidebar nav: My business trips (trips tab) | Business Trip requests (approval tab only) */}
          <nav className="flex flex-col gap-0.5">
            {mainTab === 'trips' ? (
              <button
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full bg-primary/10 text-primary font-medium"
              >
                <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-primary/15">
                  <Briefcase className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-tight">My business trips</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                    View and file trip requests
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
              </button>
            ) : (
              canApprove && (
                <button
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full bg-primary/10 text-primary font-medium"
                >
                  <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-primary/15">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight">Business Trip requests</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      Review and approve requests
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                </button>
              )
            )}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Mobile: My Trips | Approval tabs when sidebar hidden */}
          {canApprove && (
            <div className="lg:hidden flex rounded-lg bg-muted p-0.5 shrink-0 mb-4">
              <button
                onClick={() => {
                  setMainTab('trips');
                  setSearchParams({});
                }}
                className={cn(
                  'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                  mainTab === 'trips'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                My Trips
              </button>
              <button
                onClick={() => {
                  setMainTab('approval');
                  setSearchParams({ tab: 'approval' });
                }}
                className={cn(
                  'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
                  mainTab === 'approval'
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Approval
              </button>
            </div>
          )}

          {mainTab === 'approval' ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <BusinessTripApprovals embedded />
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <Card className="flex flex-col flex-1 min-h-0">
                <CardHeader className="flex flex-row items-center justify-between shrink-0">
                <CardTitle className="text-base">My Business Trip Requests</CardTitle>
                <Button
                  onClick={() => {
                    setForm({
                      trip_type: 'work_visit_domestic',
                      location: '',
                      purpose: '',
                      start_date: '',
                      end_date: '',
                    });
                    setTripAttachmentFile(null);
                    setFileDialogOpen(true);
                  }}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  File Trip
                </Button>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 overflow-y-auto">
                {myTrips.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No business trip requests yet
                  </p>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trip Type</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Approved/Rejected by</TableHead>
                          <TableHead className="w-[80px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedTrips.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">
                              {TRIP_TYPE_LABELS[t.trip_type ?? ''] ?? t.trip_type ?? '—'}
                            </TableCell>
                            <TableCell>{t.destination || '—'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{t.purpose || '—'}</TableCell>
                            <TableCell>
                              {formatDate(t.start_date)} – {formatDate(t.end_date)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  t.status === 'approved'
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : t.status === 'rejected'
                                      ? 'bg-red-100 text-red-700 border-red-200'
                                      : 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                }
                              >
                                {t.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                              {(t.status === 'approved' || t.status === 'rejected') && t.approver_name
                                ? t.approver_name
                                : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={() => setViewingTrip(t)}
                              >
                                <Eye className="h-4 w-4 mr-1.5" />
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      totalItems={myTrips.length}
                      currentPage={tripPage}
                      onPageChange={setTripPage}
                      pageSize={PAGE_SIZE}
                      className="pt-2"
                    />
                  </>
                )}
              </CardContent>
            </Card>
            </div>
          )}
        </div>
      </div>

      <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>File Business Trip Request</DialogTitle>
            <DialogDescription>
              Submit a business trip request. Your immediate superior will review and approve or reject it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Trip Type *</Label>
              <Select
                value={form.trip_type}
                onValueChange={(v) => setForm((p) => ({ ...p, trip_type: v as TripType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Location *</Label>
              <Input
                placeholder="e.g. Cebu City"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Purpose *</Label>
              <Textarea
                placeholder="Describe the purpose of the trip"
                value={form.purpose}
                onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.start_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {form.start_date ? formatDate(form.start_date) : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.start_date ? new Date(form.start_date + 'T12:00:00') : undefined}
                      onSelect={(d) =>
                        setForm((p) => ({
                          ...p,
                          start_date: d ? d.toISOString().slice(0, 10) : '',
                        }))
                      }
                      disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.end_date && 'text-muted-foreground'
                      )}
                    >
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {form.end_date ? formatDate(form.end_date) : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.end_date ? new Date(form.end_date + 'T12:00:00') : undefined}
                      onSelect={(d) =>
                        setForm((p) => ({
                          ...p,
                          end_date: d ? d.toISOString().slice(0, 10) : '',
                        }))
                      }
                      disabled={(d) => {
                        const min = form.start_date ? new Date(form.start_date + 'T12:00:00') : new Date();
                        return d < min;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attachment (optional)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setTripAttachmentFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFileDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingTrip} onOpenChange={(o) => !o && setViewingTrip(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trip Details</DialogTitle>
          </DialogHeader>
          {viewingTrip && (
            <div className="space-y-4 py-4">
              <div>
                <p className="text-xs text-muted-foreground">Trip Type</p>
                <p className="font-medium">
                  {TRIP_TYPE_LABELS[viewingTrip.trip_type ?? ''] ?? viewingTrip.trip_type ?? '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{viewingTrip.destination || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Purpose</p>
                <p className="text-sm">{viewingTrip.purpose || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dates</p>
                <p className="font-medium">
                  {formatDate(viewingTrip.start_date)} – {formatDate(viewingTrip.end_date)}
                </p>
              </div>
              {viewingTrip.attachment_url && (
                <a
                  href={viewingTrip.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-2"
                >
                  <Paperclip className="h-4 w-4" />
                  View attachment
                </a>
              )}
              {(viewingTrip.status === 'approved' || viewingTrip.status === 'rejected') &&
                viewingTrip.approver_name && (
                  <p className="text-xs text-muted-foreground">
                    {viewingTrip.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                    {viewingTrip.approver_name}
                  </p>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessTrip;
