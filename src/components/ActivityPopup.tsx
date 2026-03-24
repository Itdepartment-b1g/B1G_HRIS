import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { supabase } from '@/lib/supabase';
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
import { Loader2, MessageCircle, FileText, ClipboardList, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isImageUrl } from '@/lib/attachmentUtils';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';

type PendingItem =
  | { type: 'announcement'; id: string; title: string; content: string; attachment_url?: string | null }
  | { type: 'policy'; id: string; title: string; description: string; attachment_url?: string | null }
  | { type: 'survey'; id: string; title: string; description: string | null };

const ActivityPopup = () => {
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledgementing] = useState(false);
  const [open, setOpen] = useState(false);
  const [surveyDialogOpen, setSurveyDialogOpen] = useState(false);
  const [surveyDialogId, setSurveyDialogId] = useState<string | null>(null);

  const today = format(new Date(), 'yyyy-MM-dd');

  const fetchPending = useCallback(async () => {
    if (!currentUser?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [annRes, polRes, surveyRes] = await Promise.all([
      supabase
        .from('announcements')
        .select('id, title, content, attachment_url, publish_date, expiration_date, target_audience, target_employee_ids')
        .or(`publish_date.lte.${today},publish_date.is.null`)
        .or(`expiration_date.gte.${today},expiration_date.is.null`),
      supabase
        .from('policies')
        .select('id, title, description, attachment_url, effective_date, target_audience, target_employee_ids')
        .lte('effective_date', today),
      supabase
        .from('surveys')
        .select('id, title, description, start_date, end_date, target_audience, target_employee_ids')
        .lte('start_date', today)
        .gte('end_date', today),
    ]);

    const { data: ackAnn } = await supabase
      .from('announcement_acknowledgements')
      .select('announcement_id')
      .eq('employee_id', currentUser.id);
    const ackedAnnIds = new Set((ackAnn || []).map((x) => x.announcement_id));

    const { data: ackPol } = await supabase
      .from('policy_acknowledgements')
      .select('policy_id')
      .eq('employee_id', currentUser.id);
    const ackedPolIds = new Set((ackPol || []).map((x) => x.policy_id));

    const { data: respData } = await supabase
      .from('survey_responses')
      .select('survey_id')
      .eq('employee_id', currentUser.id);
    const { data: compData } = await supabase
      .from('survey_completions')
      .select('survey_id')
      .eq('employee_id', currentUser.id);
    const completedSurveyIds = new Set([
      ...(respData || []).map((r) => r.survey_id),
      ...(compData || []).map((r) => r.survey_id),
    ]);

    const annRows = (annRes.data || []) as Array<{
      id: string;
      title: string;
      content: string;
      attachment_url?: string | null;
      expiration_date?: string | null;
      target_audience?: string;
      target_employee_ids?: string[];
    }>;
    const polRows = (polRes.data || []) as Array<{
      id: string;
      title: string;
      description: string;
      attachment_url?: string | null;
      target_audience?: string;
      target_employee_ids?: string[];
    }>;
    const surveyRows = (surveyRes.data || []) as Array<{
      id: string;
      title: string;
      description?: string | null;
      target_audience?: string;
      target_employee_ids?: string[];
    }>;

    const userId = currentUser.id.toLowerCase();
    const isTargetedToUser = (targetAudience?: string, targetIds?: string[]) =>
      targetAudience !== 'selected' || !targetIds?.length || targetIds.some((id) => id?.toLowerCase() === userId);

    const pending: PendingItem[] = [];
    for (const a of annRows) {
      if (ackedAnnIds.has(a.id)) continue;
      if (!isTargetedToUser(a.target_audience, a.target_employee_ids)) continue;
      if (a.expiration_date && a.expiration_date < today) continue;
      pending.push({ type: 'announcement', id: a.id, title: a.title, content: a.content, attachment_url: a.attachment_url });
    }
    for (const p of polRows) {
      if (ackedPolIds.has(p.id)) continue;
      if (!isTargetedToUser(p.target_audience, p.target_employee_ids)) continue;
      pending.push({ type: 'policy', id: p.id, title: p.title, description: p.description, attachment_url: p.attachment_url });
    }
    for (const s of surveyRows) {
      if (completedSurveyIds.has(s.id)) continue;
      if (!isTargetedToUser(s.target_audience, s.target_employee_ids)) continue;
      pending.push({ type: 'survey', id: s.id, title: s.title, description: s.description || null });
    }
    setItems(pending);
    setOpen(pending.length > 0);
    setLoading(false);
  }, [currentUser?.id, today]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Refetch when user returns to tab or navigates to dashboard
  useEffect(() => {
    if (!currentUser?.id) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchPending();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [currentUser?.id, fetchPending]);
  
  // Listen for explicit refetch (e.g. when creator creates item in same tab)
  useEffect(() => {
    const onRefetch = () => fetchPending();
    window.addEventListener('activity-popup-refetch', onRefetch);
    return () => window.removeEventListener('activity-popup-refetch', onRefetch);
  }, [fetchPending]);

  // Periodic polling when no pending items (fallback if realtime misses other users)
  useEffect(() => {
    if (!currentUser?.id || items.length > 0) return;
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.id, items.length, fetchPending]);

  // Realtime: refetch pending when new announcements, policies, or surveys are created
  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel('activity-popup-pending')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => fetchPending())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'policies' }, () => fetchPending())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'surveys' }, () => fetchPending())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, fetchPending]);

  const handleAcknowledge = async () => {
    const item = items[0];
    if (!item || !currentUser?.id) return;
    setAcknowledgementing(true);
    const table = item.type === 'announcement' ? 'announcement_acknowledgements' : 'policy_acknowledgements';
    const col = item.type === 'announcement' ? 'announcement_id' : 'policy_id';
    const { error } = await supabase
      .from(table)
      .insert({ [col]: item.id, employee_id: currentUser.id });
    if (error) {
      const isDuplicate =
        error.code === '23505' ||
        /duplicate|unique.*violates/i.test(error.message ?? '');
      if (isDuplicate) {
        // Already acknowledged (e.g. via Activity tab or double-click) – treat as success
      } else {
        setAcknowledgementing(false);
        return;
      }
    }
    setItems((prev) => prev.slice(1));
    if (items.length <= 1) setOpen(false);
    refetchCompliance();
    setAcknowledgementing(false);
  };

  const handleTakeSurvey = () => {
    const item = items[0];
    if (item?.type === 'survey') {
      setSurveyDialogId(item.id);
      setSurveyDialogOpen(true);
    }
  };

  const handleSurveySuccess = () => {
    setItems((prev) => {
      const next = prev.slice(1);
      if (prev.length <= 1) setOpen(false);
      return next;
    });
    refetchCompliance();
    setSurveyDialogOpen(false);
    setSurveyDialogId(null);
  };

  if (loading || items.length === 0) return null;

  const item = items[0];
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
            {item.type === 'announcement' ? item.content : item.type === 'policy' ? item.description : item.description || 'Please complete this survey.'}
          </p>
          {item.type !== 'survey' && item.attachment_url && (
            isImageUrl(item.attachment_url) ? (
              <div className="mt-4">
                <img src={item.attachment_url} alt="Attachment" className="max-w-full max-h-64 rounded-lg border object-contain" />
              </div>
            ) : (
              <a
                href={item.attachment_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2.5 rounded-lg border bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View attachment
              </a>
            )
          )}
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-4 border-t">
          {item.type === 'survey' ? (
            <Button onClick={handleTakeSurvey} size="lg" className="w-full sm:w-auto">
              Take Survey
            </Button>
          ) : (
            <Button onClick={handleAcknowledge} disabled={acknowledging} size="lg" className="w-full sm:w-auto">
              {acknowledging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {item.type === 'announcement' ? 'I Understand' : 'I Acknowledge'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default ActivityPopup;
