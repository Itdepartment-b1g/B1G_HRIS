import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Shield,
  Key,
  Monitor,
  Smartphone,
  Globe,
  LogOut,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface UserSession {
  id: string;
  session_token: string;
  platform: string | null;
  browser: string | null;
  last_active: string;
  created_at: string;
}

function parseUserAgent(ua: string): { platform: string; browser: string } {
  let platform = 'Unknown Platform';
  let browser = 'Unknown Browser';

  if (/iPhone/.test(ua)) platform = `iPhone - iOS ${ua.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') || ''}`;
  else if (/iPad/.test(ua)) platform = `iPad - iOS ${ua.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') || ''}`;
  else if (/Android/.test(ua)) platform = `Android ${ua.match(/Android ([\d.]+)/)?.[1] || ''}`;
  else if (/Mac OS X/.test(ua)) platform = `macOS ${ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || ''}`;
  else if (/Windows/.test(ua)) platform = `Windows ${ua.match(/Windows NT ([\d.]+)/)?.[1] || ''}`;
  else if (/Linux/.test(ua)) platform = 'Linux';

  if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] || ''}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] || ''}`;
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`;
  else if (/Edg\//.test(ua)) browser = `Edge ${ua.match(/Edg\/([\d.]+)/)?.[1] || ''}`;

  return { platform, browser };
}

function getDeviceIcon(platform: string | null) {
  if (!platform) return Monitor;
  const lower = platform.toLowerCase();
  if (lower.includes('iphone') || lower.includes('android') || lower.includes('ipad')) return Smartphone;
  return Monitor;
}

function getCurrentSessionId(): string | null {
  return localStorage.getItem('b1g_session_id');
}

const Settings = () => {
  const { user } = useCurrentUser();
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  // Terminate dialog
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateTarget, setTerminateTarget] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  const currentSessionId = getCurrentSessionId();

  const fetchSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false });

    if (error) console.error(error);
    setSessions((data || []) as UserSession[]);
    setLoadingSessions(false);
  };

  useEffect(() => {
    fetchSessions();
  }, [user]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const otherSessions = sessions.filter((s) => s.id !== currentSessionId);

  // --- Change Password ---
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error(error.message || 'Failed to change password');
    } else {
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    setChangingPw(false);
  };

  // --- Terminate Session ---
  const handleTerminateSession = async (sessionId: string) => {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) {
      toast.error('Failed to terminate session');
    } else {
      toast.success('Session terminated');
      fetchSessions();
    }
    setTerminateOpen(false);
    setTerminateTarget(null);
  };

  const handleTerminateAll = async () => {
    if (!user) return;
    setTerminatingAll(true);
    const ids = otherSessions.map((s) => s.id);
    if (ids.length > 0) {
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .in('id', ids);
      if (error) {
        toast.error('Failed to terminate sessions');
      } else {
        toast.success(`${ids.length} session(s) terminated`);
        fetchSessions();
      }
    }
    setTerminatingAll(false);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!user) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account security and active sessions</p>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Account & Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Name</p>
              <p className="text-sm text-foreground mt-0.5">{user.first_name} {user.last_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Employee Code</p>
              <p className="text-sm text-foreground mt-0.5 font-mono">{user.employee_code}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Email</p>
              <p className="text-sm text-foreground mt-0.5">{user.email}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Role</p>
              <p className="text-sm text-foreground mt-0.5 capitalize">{(user.role || 'employee').replace('_', ' ')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password + Active Sessions — 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label>New Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Confirm New Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmPassword && newPassword === confirmPassword && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Passwords match
                  </p>
                )}
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
              <Button type="submit" disabled={changingPw} className="bg-primary hover:bg-primary/90 text-white">
                {changingPw && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Active Sessions
              </CardTitle>
              {otherSessions.length > 0 && (
                <button
                  onClick={handleTerminateAll}
                  disabled={terminatingAll}
                  className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                >
                  {terminatingAll ? 'Terminating...' : 'Terminate All Others'}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Current Session */}
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Session</h4>
                  {currentSession ? (
                    <div className="flex items-start gap-3 p-3 rounded-lg border bg-primary/5 border-primary/15">
                      {(() => {
                        const DeviceIcon = getDeviceIcon(currentSession.platform);
                        return <DeviceIcon className="h-7 w-7 text-primary shrink-0 mt-0.5" />;
                      })()}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{currentSession.platform || 'Unknown Platform'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Last Active {formatDate(currentSession.last_active)}
                        </p>
                        <p className="text-xs text-muted-foreground">{currentSession.browser || 'Unknown Browser'}</p>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0 text-[10px]">
                        Current
                      </Badge>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border bg-muted/50 text-center">
                      <p className="text-sm text-muted-foreground">No session data recorded yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Appears on next login.</p>
                    </div>
                  )}
                </div>

                {/* Other Sessions */}
                {otherSessions.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Other Active Sessions</h4>
                    <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-muted/80 border-b">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Last Active</th>
                            <th className="text-left font-medium text-muted-foreground px-3 py-2 text-xs">Platform</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {otherSessions.map((session) => (
                            <tr key={session.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2.5">
                                <p className="text-foreground text-xs">{formatDate(session.last_active)}</p>
                                <p className="text-[11px] text-muted-foreground">{session.browser || '—'}</p>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                                {session.platform || '—'}
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  onClick={() => {
                                    setTerminateTarget(session.id);
                                    setTerminateOpen(true);
                                  }}
                                  className="text-red-500 hover:text-red-600 transition-colors"
                                  title="Terminate session"
                                >
                                  <LogOut className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {sessions.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Globe className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No active sessions found.</p>
                    <p className="text-xs mt-1">Sessions will appear after your next login.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Terminate Confirmation */}
      <AlertDialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Session</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the session on that device. The user will need to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => terminateTarget && handleTerminateSession(terminateTarget)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
