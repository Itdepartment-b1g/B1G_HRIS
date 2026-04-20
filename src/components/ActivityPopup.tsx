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
import { Loader2, MessageCircle, FileText, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActivityCompliance } from '@/hooks/useActivityCompliance';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNotifications, type UserNotification } from '@/hooks/useNotifications';
import { supabase } from '@/lib/supabase';

const ActivityPopup = () => {
  const navigate = useNavigate();
  const { user: currentUser } = useCurrentUser();
  const { refetch: refetchCompliance } = useActivityCompliance();
  const { ackPending, loading, acknowledge } = useNotifications(currentUser?.id);
  const [acknowledging, setAcknowledging] = useState(false);
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

  const handleAcknowledge = async () => {
    if (!item) return;
    setAcknowledging(true);
    await acknowledge(item.id);
    if (validAckPending.length <= 1) setOpen(false);
    refetchCompliance();
    setAcknowledging(false);
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
