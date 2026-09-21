import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SurveyAnswerDialog } from '@/components/SurveyAnswerDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, MessageCircle, FileText, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications, type UserNotification } from '@/hooks/useNotifications';
import { acknowledgeAnnouncement, acknowledgePolicy } from '@/lib/activityAcknowledgements';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const MANILA_TZ = 'Asia/Manila';

function formatPolicyVersion(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = value.length <= 10 ? `${value}T00:00:00+08:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: MANILA_TZ,
  }).format(d);
  return parts.replace(/-/g, '.');
}

function formatManilaDate(value: string | null | undefined): string {
  if (!value) return '—';
  const iso = value.length <= 10 ? `${value}T00:00:00+08:00` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: MANILA_TZ,
  });
}

function formatManilaDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: MANILA_TZ,
  });
}

function employeeDisplayName(user: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!user) return '—';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || '—';
}

interface PolicyAckDetails {
  title: string;
  effective_date: string | null;
  created_at: string | null;
}

function PolicyAcknowledgmentCertificate({
  policyName,
  version,
  effectiveDate,
  acknowledgedAt,
  employeeName,
  employeeId,
}: {
  policyName: string;
  version: string;
  effectiveDate: string;
  acknowledgedAt: string;
  employeeName: string;
  employeeId: string;
}) {
  return (
    <div className="w-full max-h-64 overflow-y-auto rounded-lg border bg-muted/40 p-4 space-y-3 text-sm text-foreground leading-relaxed">
      <p>
        I acknowledge that I have received access to and have read and reviewed the{' '}
        <span className="font-semibold">{policyName}</span>, including its applicable provisions,
        procedures, and requirements.
      </p>
      <p>
        I confirm that I understand the Policy and the responsibilities applicable to me as an employee of
        B1G Corporation.
      </p>
      <p>
        I understand that I am expected to comply with the Policy and any applicable procedures or guidelines
        issued pursuant to it, subject to applicable laws and regulations.
      </p>
      <p>
        I understand that I may seek clarification from Human Resources or my immediate superior regarding any
        provision that I do not understand or believe requires further explanation.
      </p>
      <p>
        I acknowledge that violations of applicable company policies may be subject to appropriate administrative
        action in accordance with B1G Corporation&apos;s policies, due process requirements, and applicable laws.
      </p>
      <p>
        By clicking &ldquo;Acknowledge and Confirm,&rdquo; I certify that I have read, understood, and acknowledged
        the <span className="font-semibold">{policyName}</span>.
      </p>
      <dl className="grid gap-1.5 pt-2 border-t text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Policy Version:</dt>
          <dd className="font-medium">{version}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Effective Date:</dt>
          <dd className="font-medium">{effectiveDate}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Acknowledgment Date and Time:</dt>
          <dd className="font-medium">{acknowledgedAt}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Employee Name:</dt>
          <dd className="font-medium">{employeeName}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Employee ID:</dt>
          <dd className="font-medium">{employeeId}</dd>
        </div>
      </dl>
    </div>
  );
}

const ActivityPopup = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const { ackPending, loading, acknowledge } = useNotifications(currentUser?.id);
  const [acknowledging, setAcknowledging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [ackAt, setAckAt] = useState<Date | null>(null);
  const [policyDetails, setPolicyDetails] = useState<PolicyAckDetails | null>(null);
  const [open, setOpen] = useState(false);
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [surveyDialogId, setSurveyDialogId] = useState<string | null>(null);
  const [validAckPending, setValidAckPending] = useState<UserNotification[]>([]);

  // Filter out expired surveys from pending notifications
  useEffect(() => {
    const filterValidNotifications = async () => {
      if (!ackPending.length) {
        setValidAckPending([]);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const valid: UserNotification[] = [];
      const expiredSurveyIds: string[] = [];

      for (const notification of ackPending) {
        // For surveys, check if end_date has passed
        if (notification.type === 'survey') {
          const metadata = (notification.metadata || {}) as Record<string, unknown>;
          const surveyId = metadata.survey_id as string | undefined;

          if (surveyId) {
            const { data: survey } = await supabase
              .from('surveys')
              .select('end_date')
              .eq('id', surveyId)
              .single();

            if (survey && survey.end_date < today) {
              // Survey expired - auto-acknowledge
              expiredSurveyIds.push(notification.id);
              continue;
            }
          }
        }
        valid.push(notification);
      }

      // Auto-acknowledge expired surveys
      if (expiredSurveyIds.length > 0) {
        await Promise.all(expiredSurveyIds.map((id) => acknowledge(id)));
        refetchCompliance();
      }

      setValidAckPending(valid);
    };

    filterValidNotifications();
  }, [ackPending, acknowledge, refetchCompliance]);

  const item = validAckPending[0];
  const metadata = (item?.metadata || {}) as Record<string, unknown>;

  useEffect(() => {
    setOpen(validAckPending.length > 0);
  }, [validAckPending.length]);

  useEffect(() => {
    setConfirmed(false);
    setAckAt(null);
  }, [item?.id]);

  useEffect(() => {
    if (item?.type !== 'policy') {
      setPolicyDetails(null);
      return;
    }
    const policyId = metadata.policy_id;
    if (typeof policyId !== 'string' || !policyId) {
      setPolicyDetails({ title: item.title, effective_date: null, created_at: null });
      return;
    }
    let cancelled = false;
    supabase
      .from('policies')
      .select('title, effective_date, created_at')
      .eq('id', policyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setPolicyDetails(
          data
            ? {
                title: data.title || item.title,
                effective_date: data.effective_date ?? null,
                created_at: data.created_at ?? null,
              }
            : { title: item.title, effective_date: null, created_at: null }
        );
      });
    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.type, item?.title, metadata.policy_id]);

  const handleAcknowledge = async () => {
    if (!item || !currentUser?.id || !confirmed) return;
    setAcknowledging(true);
    try {
      if (item.type === 'announcement') {
        const announcementId = metadata.announcement_id;
        if (typeof announcementId === 'string' && announcementId) {
          await acknowledgeAnnouncement(currentUser.id, announcementId);
        }
      } else if (item.type === 'policy') {
        const policyId = metadata.policy_id;
        if (typeof policyId === 'string' && policyId) {
          await acknowledgePolicy(currentUser.id, policyId);
        }
      }
      await acknowledge(item.id);
      if (validAckPending.length <= 1) setOpen(false);
      refetchCompliance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record acknowledgement.');
    } finally {
      setAcknowledging(false);
    }
  };

  const handleTakeSurvey = () => {
    if (item?.type === 'survey') {
      const surveyId = metadata.survey_id;
      if (typeof surveyId === 'string' && surveyId) {
        setSurveyDialogId(surveyId);
      } else if (item.action_url) {
        navigate(item.action_url);
        return;
      }
      setSurveyDialogOpen(true);
    }
  };

  const handleSurveySuccess = () => {
    if (item) acknowledge(item.id);
    if (validAckPending.length <= 1) setOpen(false);
    refetchCompliance();
    setSurveyDialogOpen(false);
    setSurveyDialogId(null);
  };

  if (loading || validAckPending.length === 0) return null;
  if (!item) return null;

  return (
    <>
    <SurveyAnswerDialog
      surveyId={surveyDialogId}
      open={surveyDialogOpen}
      onOpenChange={(o) => {
        setSurveyDialogOpen(o);
        if (!o) setSurveyDialogId(null);
      }}
      onSuccess={handleSurveySuccess}
    />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl sm:max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4 pb-4 border-b">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                item.type === 'announcement' && 'bg-violet-100',
                item.type === 'policy' && 'bg-blue-100',
                item.type === 'survey' && 'bg-amber-100'
              )}
            >
              {item.type === 'announcement' ? (
                <MessageCircle className="h-6 w-6 text-violet-600" />
              ) : item.type === 'policy' ? (
                <FileText className="h-6 w-6 text-blue-600" />
              ) : (
                <ClipboardList className="h-6 w-6 text-amber-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                New {item.type === 'announcement' ? 'Announcement' : item.type === 'policy' ? 'Policy' : 'Survey'}
              </p>
              <DialogTitle className="text-lg font-semibold mt-1 text-foreground">{item.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="sr-only">
            Please review before continuing. You must acknowledge to proceed.
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 overflow-y-auto">
          <p className="text-foreground leading-relaxed whitespace-pre-wrap">
            {item.message || 'Please review this item.'}
          </p>
        </div>
        <DialogFooter className="flex-col gap-3 pt-4 border-t sm:flex-col sm:space-x-0">
          {item.type === 'survey' ? (
            <Button onClick={handleTakeSurvey} size="lg" className="w-full sm:w-auto">
              Take Survey
            </Button>
          ) : (
            <>
              {item.type === 'policy' && confirmed && (
                <PolicyAcknowledgmentCertificate
                  policyName={policyDetails?.title || item.title}
                  version={formatPolicyVersion(policyDetails?.created_at)}
                  effectiveDate={formatManilaDate(policyDetails?.effective_date)}
                  acknowledgedAt={ackAt ? formatManilaDateTime(ackAt) : '—'}
                  employeeName={employeeDisplayName(currentUser)}
                  employeeId={currentUser?.employee_code || '—'}
                />
              )}
              <label
                htmlFor="activity-ack-confirm"
                className="flex w-full items-start gap-2 text-left cursor-pointer"
              >
                <Checkbox
                  id="activity-ack-confirm"
                  checked={confirmed}
                  onCheckedChange={(checked) => {
                    const on = checked === true;
                    setConfirmed(on);
                    setAckAt(on ? new Date() : null);
                  }}
                  className="mt-0.5"
                />
                <span className="text-sm leading-snug text-muted-foreground">
                  {item.type === 'announcement'
                    ? 'I confirm that I have read, understood, and acknowledged this announcement.'
                    : 'I confirm that I have read, understood, and acknowledged this policy.'}
                </span>
              </label>
              <Button
                onClick={handleAcknowledge}
                disabled={acknowledging || !confirmed}
                size="lg"
                className="w-full sm:w-auto"
              >
                {acknowledging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {item.type === 'announcement' ? 'I Understand' : 'Acknowledge and Confirm'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default ActivityPopup;
