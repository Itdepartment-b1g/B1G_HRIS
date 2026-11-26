import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, FileDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { SignaturePad } from '@/components/performance/SignaturePad';
import { cn } from '@/lib/utils';
import { downloadClearancePdf } from '@/lib/exportClearance';
import {
  CLEARANCE_INSTRUCTIONS,
  CLEARANCE_NOTICES,
  addClearanceItem,
  canSignSection,
  cancelClearance,
  clearanceProgress,
  deleteClearanceItem,
  fetchClearance,
  formatClearanceDate,
  isHrAdmin,
  manilaToday,
  remindClearance,
  runClearanceSchedule,
  sectionSignerName,
  signClearanceItem,
  unsignClearanceItem,
  updateClearanceDetails,
  type ClearanceItem,
  type ClearanceRecord,
} from '@/lib/offboarding';

function show(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : '—';
}

const OffboardingClearance = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const admin = isHrAdmin(user?.roles);
  const [clearance, setClearance] = useState<ClearanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [signItem, setSignItem] = useState<ClearanceItem | null>(null);
  const [remarks, setRemarks] = useState('');
  const [deduction, setDeduction] = useState('');
  const [signature, setSignature] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    resignationSubmittedOn: '',
    lastWorkingDay: '',
    acceptanceDate: '',
    reason: '',
    dailyMonthlyRate: '',
    grossPay: '',
  });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelNote, setCancelNote] = useState('');
  const [unsignId, setUnsignId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!id) return;
    if (!silent) setLoading(true);
    try {
      if (!silent && admin) {
        try { await runClearanceSchedule(); } catch { /* The list page reports a missing migration. */ }
      }
      const row = await fetchClearance(id);
      setClearance(row);
      setMissing(!row);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load this exit clearance');
      setMissing(true);
    }
    if (!silent) setLoading(false);
  }, [admin, id]);

  useEffect(() => { load(); }, [load]);

  const progress = clearance ? clearanceProgress(clearance.sections) : null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    }
    setBusy(false);
  };

  const openSign = (item: ClearanceItem) => {
    setSignItem(item);
    setRemarks('');
    setDeduction('');
    setSignature(null);
  };

  const submitSign = () => {
    if (!signItem) return;
    if (!signature) {
      toast.error('Draw your signature before clearing this item');
      return;
    }
    const item = signItem;
    void run(async () => {
      const completed = await signClearanceItem(item.id, remarks, deduction, signature);
      setSignItem(null);
      toast.success(completed
        ? 'All items are signed. The employee is now cleared and marked resigned.'
        : 'Item cleared.');
    });
  };

  const saveDetails = () => {
    if (!clearance) return;
    if (!editForm.resignationSubmittedOn || !editForm.lastWorkingDay || !editForm.acceptanceDate) {
      toast.error('Resignation letter date, last working day, and acceptance date are required');
      return;
    }
    void run(async () => {
      await updateClearanceDetails({ id: clearance.id, ...editForm });
      setEditOpen(false);
      toast.success('Clearance details saved');
    });
  };

  const fields = clearance
    ? [
        ['Name', clearance.employee_name],
        ['Employee no.', show(clearance.employee_code)],
        ['Company', show(clearance.company_name)],
        ['Position', show(clearance.position_name)],
        ['Hiring date', formatClearanceDate(clearance.hired_date)],
        ['Department', show(clearance.department_name)],
        ['Daily/month rate', show(clearance.daily_monthly_rate)],
        ['Resignation date', formatClearanceDate(clearance.resignation_submitted_on)],
        ['Immediate head', show(clearance.immediate_head_name)],
        ['Gross', show(clearance.gross_pay)],
        ['Acceptance date', formatClearanceDate(clearance.acceptance_date)],
        ['Status', show(clearance.employment_status)],
      ]
    : [];

  if (!user) return null;

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
        Loading clearance
      </p>
    );
  }

  if (missing || !clearance || !progress) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">This exit clearance is not available to you.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard/offboarding')}>Back to Offboarding</Button>
      </div>
    );
  }

  const due = clearance.last_working_day <= manilaToday();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/dashboard/offboarding')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Offboarding
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{clearance.employee_name}</h1>
            <Badge
              variant="outline"
              className={cn(
                clearance.status === 'cleared' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                clearance.status === 'in_progress' && 'border-amber-200 bg-amber-50 text-amber-800'
              )}
            >
              {clearance.status === 'cleared' ? 'Cleared' : clearance.status === 'cancelled' ? 'Cancelled' : 'In progress'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {progress.total === 0
              ? 'No checklist items.'
              : `${progress.cleared} of ${progress.total} sections signed.`}
            {clearance.status === 'in_progress' && progress.pendingTitles.length > 0
              ? ` Pending: ${progress.pendingTitles.join(', ')}.`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadClearancePdf(clearance).catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to download the PDF'))}>
            <FileDown className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
          {admin && clearance.status === 'in_progress' && due && progress.pendingTitles.length > 0 && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(async () => {
                const sent = await remindClearance(clearance.id);
                toast.success(sent > 0 ? `Sent ${sent} reminder${sent === 1 ? '' : 's'}.` : 'Everyone pending was already notified.');
              })}
            >
              Remind pending
            </Button>
          )}
          {admin && clearance.status === 'in_progress' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditForm({
                    resignationSubmittedOn: clearance.resignation_submitted_on,
                    lastWorkingDay: clearance.last_working_day,
                    acceptanceDate: clearance.acceptance_date,
                    reason: clearance.reason ?? '',
                    dailyMonthlyRate: clearance.daily_monthly_rate ?? '',
                    grossPay: clearance.gross_pay ?? '',
                  });
                  setEditOpen(true);
                }}
              >
                Edit details
              </Button>
              <Button variant="outline" onClick={() => { setCancelNote(''); setCancelOpen(true); }}>
                Cancel clearance
              </Button>
            </>
          )}
        </div>
      </div>

      {clearance.status === 'in_progress' && (
        <p className="text-sm text-muted-foreground">
          {due
            ? clearance.heads_notified_at
              ? `Department heads were notified on ${formatClearanceDate(clearance.heads_notified_at.slice(0, 10))}.`
              : 'This last working day has arrived. Notices go out when HR opens Offboarding.'
            : `Department heads are notified on the last working day, ${formatClearanceDate(clearance.last_working_day)}.`}
        </p>
      )}
      {clearance.status === 'cancelled' && clearance.cancel_note && (
        <p className="text-sm text-muted-foreground">Cancelled: {clearance.cancel_note}</p>
      )}

      <div className="border rounded-lg bg-card overflow-hidden">
        <div className="px-4 py-4 border-b text-center">
          <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">{show(clearance.company_name)}</p>
          <h2 className="text-lg font-bold mt-1">Employee Accountability and Exit Clearance</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="border-b border-r px-3 py-2.5">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
              <p className="text-sm mt-0.5">{value}</p>
            </div>
          ))}
          <div className="border-b border-r px-3 py-2.5">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Last working day</p>
            <p className="text-sm mt-0.5">{formatClearanceDate(clearance.last_working_day)}</p>
          </div>
          <div className="border-b px-3 py-2.5 sm:col-span-2">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Reason</p>
            <p className="text-sm mt-0.5">{show(clearance.reason)}</p>
          </div>
        </div>
        <div className="px-4 py-3 border-t bg-muted/30 text-sm space-y-1">
          <p className="font-medium">Notice to employee</p>
          {CLEARANCE_NOTICES.map((notice, index) => (
            <p key={notice}>{index + 1}. {notice}</p>
          ))}
          <p className="text-muted-foreground pt-1">{CLEARANCE_INSTRUCTIONS}</p>
        </div>
      </div>

      <div className="border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
              <th className="px-3 py-2 font-medium">Name / signature</th>
              <th className="px-3 py-2 font-medium">Deduction</th>
              <th className="px-3 py-2 font-medium">Date cleared</th>
              <th className="px-3 py-2 font-medium w-[140px]" />
            </tr>
          </thead>
          {clearance.sections.map((section) => {
            const canSign = user.id ? canSignSection(clearance, section, user.id, admin) : false;
            const sectionDone = section.items.length > 0 && section.items.every((item) => item.cleared_on);
            return (
              <tbody key={section.id} className="border-t">
                <tr className="bg-slate-50">
                  <td colSpan={7} className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{section.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {sectionDone ? 'Cleared' : `To be signed by ${sectionSignerName(clearance, section)}`}
                      </span>
                    </div>
                  </td>
                </tr>
                {section.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-3 text-muted-foreground">No items in this section.</td>
                  </tr>
                )}
                {section.items.map((item) => (
                  <tr key={item.id} className="border-t align-top">
                    <td className="px-3 py-2 text-muted-foreground">{section.title}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className={cn('mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border', item.cleared_on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-input')}>
                          {item.cleared_on && <Check className="h-3 w-3" />}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">{show(item.remarks)}</td>
                    <td className="px-3 py-2">
                      {item.signature_data ? (
                        <div>
                          <img src={item.signature_data} alt={`Signature of ${item.signed_name ?? 'signer'}`} className="h-12 w-auto bg-white border rounded" />
                          <p className="text-xs text-muted-foreground mt-1">{item.signed_name}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{show(item.deduction)}</td>
                    <td className="px-3 py-2">{item.cleared_on ? formatClearanceDate(item.cleared_on) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {!item.cleared_on && canSign && (
                          <Button size="sm" disabled={busy} onClick={() => openSign(item)}>Sign</Button>
                        )}
                        {item.cleared_on && clearance.status !== 'cancelled' && (admin || (clearance.status === 'in_progress' && item.signed_by === user.id)) && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUnsignId(item.id)}>Remove</Button>
                        )}
                        {admin && !item.cleared_on && clearance.status === 'in_progress' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={busy}
                            aria-label="Delete item"
                            onClick={() => void run(async () => {
                              await deleteClearanceItem(item.id);
                              toast.success('Item removed');
                            })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {canSign && (
                  <tr className="border-t">
                    <td colSpan={7} className="px-3 py-2">
                      <form
                        className="flex gap-2 max-w-lg"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const label = (drafts[section.id] ?? '').trim();
                          if (!label) return;
                          void run(async () => {
                            await addClearanceItem(section.id, label);
                            setDrafts((current) => ({ ...current, [section.id]: '' }));
                            toast.success('Item added');
                          });
                        }}
                      >
                        <Input
                          value={drafts[section.id] ?? ''}
                          onChange={(event) => setDrafts((current) => ({ ...current, [section.id]: event.target.value }))}
                          placeholder="Add an item for this department"
                        />
                        <Button type="submit" variant="outline" disabled={busy}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </form>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      <Dialog open={!!signItem} onOpenChange={(open) => { if (!open) setSignItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign: {signItem?.label}</DialogTitle>
            <DialogDescription>Your signature clears this item for your section only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sign-remarks">Remarks</Label>
              <Textarea id="sign-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sign-deduction">Deduction</Label>
              <Input id="sign-deduction" value={deduction} onChange={(event) => setDeduction(event.target.value)} placeholder="Optional" />
            </div>
            <SignaturePad label="Signature" onChange={setSignature} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignItem(null)}>Cancel</Button>
            <Button onClick={submitSign} disabled={busy || !signature}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Clear item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit clearance details</DialogTitle>
            <DialogDescription>The checklist already copied onto this employee stays as it is.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-resignation">Resignation letter submitted</Label>
              <Input id="edit-resignation" type="date" value={editForm.resignationSubmittedOn} onChange={(event) => setEditForm({ ...editForm, resignationSubmittedOn: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-last">Actual last working day</Label>
              <Input id="edit-last" type="date" value={editForm.lastWorkingDay} onChange={(event) => setEditForm({ ...editForm, lastWorkingDay: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-acceptance">Acceptance date</Label>
              <Input id="edit-acceptance" type="date" value={editForm.acceptanceDate} onChange={(event) => setEditForm({ ...editForm, acceptanceDate: event.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-rate">Daily / month rate</Label>
                <Input id="edit-rate" value={editForm.dailyMonthlyRate} onChange={(event) => setEditForm({ ...editForm, dailyMonthlyRate: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-gross">Gross</Label>
                <Input id="edit-gross" value={editForm.grossPay} onChange={(event) => setEditForm({ ...editForm, grossPay: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">Reason</Label>
              <Textarea id="edit-reason" value={editForm.reason} onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveDetails} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this exit clearance?</AlertDialogTitle>
            <AlertDialogDescription>
              The employee stays in their current employment status. You can start a new clearance later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={cancelNote} onChange={(event) => setCancelNote(event.target.value)} placeholder="Optional note" />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void run(async () => {
                await cancelClearance(clearance.id, cancelNote);
                toast.success('Clearance cancelled');
              })}
            >
              Cancel clearance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unsignId} onOpenChange={(open) => { if (!open) setUnsignId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this signature?</AlertDialogTitle>
            <AlertDialogDescription>
              The item goes back to pending. If this clearance was already complete, the employee is restored to the employment status they had before it was cleared.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep signature</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const itemId = unsignId;
                if (!itemId) return;
                void run(async () => {
                  await unsignClearanceItem(itemId);
                  setUnsignId(null);
                  toast.success('Signature removed');
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OffboardingClearance;
