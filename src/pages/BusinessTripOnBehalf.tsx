import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Search, ChevronRight, Plus, Briefcase, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { sendRequestNotification } from '@/lib/edgeFunctions';
import { createRequestInAppNotification } from '@/lib/inAppNotifications';
import type { TripType } from '@/types';

interface EmployeeOption {
  id: string;
  name: string;
  employee_code?: string | null;
}

const TRIP_TYPES: { value: TripType; label: string }[] = [
  { value: 'work_visit_domestic', label: 'Work Visit (Domestic)' },
  { value: 'work_visit_overseas', label: 'Work Visit (Overseas)' },
  { value: 'training', label: 'Training' },
];

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toDateInput(d: Date) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

const emptyForm = {
  trip_type: 'work_visit_domestic' as TripType,
  location: '',
  purpose: '',
  start_date: '',
  end_date: '',
};

const BusinessTripOnBehalf = () => {
  const { user: currentUser } = useCurrentUser();
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tripAttachmentFile, setTripAttachmentFile] = useState<File | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const isAdmin = currentUser?.roles?.some((r) => r === 'super_admin' || r === 'admin') ?? false;

  useEffect(() => {
    const loadEmployees = async () => {
      if (!currentUser?.id) return;
      const ids = new Set<string>();
      if (isAdmin) {
        const { data } = await supabase
          .from('employees')
          .select('id, first_name, last_name, employee_code')
          .eq('is_active', true)
          .order('first_name');
        const opts =
          (data || [])
            .filter((e) => e.id !== currentUser.id)
            .map((e) => ({
              id: e.id as string,
              name: `${e.first_name} ${e.last_name}`,
              employee_code: e.employee_code as string | null,
            })) ?? [];
        setEmployees(opts);
        return;
      }

      const { data: esData } = await supabase
        .from('employee_supervisors')
        .select('employee_id')
        .eq('supervisor_id', currentUser.id);
      (esData || []).forEach((r) => ids.add(r.employee_id));
      const { data: empData } = await supabase
        .from('employees')
        .select('id')
        .eq('supervisor_id', currentUser.id)
        .eq('is_active', true);
      (empData || []).forEach((r) => ids.add(r.id));
      ids.delete(currentUser.id);
      if (ids.size === 0) {
        setEmployees([]);
        return;
      }
      const { data } = await supabase
        .from('employees')
        .select('id, first_name, last_name, employee_code')
        .in('id', Array.from(ids))
        .eq('is_active', true)
        .order('first_name');
      setEmployees(
        (data || []).map((e) => ({
          id: e.id as string,
          name: `${e.first_name} ${e.last_name}`,
          employee_code: e.employee_code as string | null,
        }))
      );
    };
    loadEmployees();
  }, [currentUser?.id, isAdmin]);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setSelectedEmployee(null);
      return;
    }
    setSelectedEmployee(employees.find((e) => e.id === selectedEmployeeId) || null);
  }, [selectedEmployeeId, employees]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 50);
    return employees.filter((e) => {
      const code = (e.employee_code || '').toLowerCase();
      return e.name.toLowerCase().includes(q) || code.includes(q);
    });
  }, [employees, employeeSearch]);

  const handleSubmit = async () => {
    if (!currentUser?.id) return;
    if (!selectedEmployeeId) {
      toast.error('Please select an employee');
      return;
    }
    if (!form.trip_type) {
      toast.error('Trip type is required');
      return;
    }
    if (!form.location.trim()) {
      toast.error('Location is required');
      return;
    }
    if (!form.purpose.trim()) {
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

      const { data, error } = await supabase.rpc('file_trip_on_behalf', {
        p_employee_id: selectedEmployeeId,
        p_trip_type: form.trip_type,
        p_location: form.location.trim(),
        p_purpose: form.purpose.trim(),
        p_start_date: form.start_date,
        p_end_date: form.end_date,
        p_attachment_url: attachmentUrl,
      });

      if (error) {
        toast.error('Failed to file business trip on behalf');
        setSubmitting(false);
        return;
      }

      const result = data as { success: boolean; error?: string; id?: string };
      if (result?.success) {
        toast.success('Business trip filed and auto-approved');
        if (result.id) {
          sendRequestNotification({
            event: 'approved',
            requestType: 'business_trip',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
          createRequestInAppNotification({
            event: 'approved',
            requestType: 'business_trip',
            requestId: result.id,
            approverId: currentUser.id,
          }).catch(() => {});
        }
        setForm(emptyForm);
        setTripAttachmentFile(null);
      } else {
        toast.error(result?.error || 'Failed to file business trip on behalf');
      }
    } catch {
      toast.error('Failed to file business trip on behalf');
    }
    setSubmitting(false);
  };

  if (!currentUser) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold">File Business Trip on Behalf</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin
            ? 'Select any employee and file a business trip that is auto-approved and applied to attendance.'
            : 'File a business trip for an employee under you. It will be auto-approved and applied to attendance.'}
        </p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)] flex-1 min-h-0">
        <Card className="min-h-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Select Employee</span>
              <Badge variant="outline">{isAdmin ? 'HR Tool' : 'Team'}</Badge>
            </CardTitle>
            <CardDescription>
              {isAdmin
                ? 'Search by name or employee code, then file a trip on their behalf.'
                : 'Only employees assigned to you are listed.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                placeholder="Search employee by name or code"
                className="pl-9"
              />
            </div>
            <div className="max-h-80 overflow-y-auto rounded-md border divide-y">
              {filteredEmployees.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {employees.length === 0 ? 'No employees assigned to you' : 'No matching employees'}
                </div>
              ) : (
                filteredEmployees.map((e) => {
                  const active = e.id === selectedEmployeeId;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelectedEmployeeId(e.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted transition-colors',
                        active && 'bg-primary/5 text-primary'
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{e.name}</span>
                        {e.employee_code && (
                          <span className="text-xs text-muted-foreground">Code: {e.employee_code}</span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })
              )}
            </div>
            {selectedEmployee && (
              <div className="mt-2 text-xs text-muted-foreground">
                Filing trip for{' '}
                <span className="font-medium text-foreground">
                  {selectedEmployee.name}
                  {selectedEmployee.employee_code ? ` (${selectedEmployee.employee_code})` : ''}
                </span>
                .
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-h-0">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Trip Details
            </CardTitle>
            <CardDescription>
              Set trip type, location, purpose, and dates. This trip will be auto-approved and marked Present on
              attendance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedEmployeeId && (
              <p className="text-sm text-muted-foreground">
                Select an employee first to file a business trip on their behalf.
              </p>
            )}
            {selectedEmployeeId && (
              <>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                              start_date: d ? toDateInput(d) : '',
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
                              end_date: d ? toDateInput(d) : '',
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
                <div className="flex items-center justify-between pt-2 border-t mt-2 gap-3">
                  <p className="text-xs text-muted-foreground max-w-[70%]">
                    This request will be filed on behalf of the selected employee, auto-approved, and marked Present on
                    attendance for the trip dates.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setConfirmSubmitOpen(true)}
                    disabled={submitting || !selectedEmployeeId}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Filing...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        File Trip
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Business Trip Filing</DialogTitle>
            <DialogDescription>
              File this business trip on behalf of {selectedEmployee?.name || 'the selected employee'}? It will be
              auto-approved and applied to their attendance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmitOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirmSubmitOpen(false);
                await handleSubmit();
              }}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Yes, confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessTripOnBehalf;
