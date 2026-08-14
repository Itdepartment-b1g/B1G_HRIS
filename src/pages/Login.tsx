import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, User, Building2, Eye, EyeOff, Mail, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { forgotPassword } from '@/lib/edgeFunctions';
import { openGmailInbox } from '@/lib/openGmail';
import { SelfieLocationCapture, type SelfieLocationValue } from '@/components/SelfieLocationCapture';
import { toast } from 'sonner';

const Login = () => {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotCode, setForgotCode] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [showForgotNew, setShowForgotNew] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [forgotVerify, setForgotVerify] = useState<SelfieLocationValue | null>(null);
  const [forgotHasSelfie, setForgotHasSelfie] = useState(false);

  // Show session expired toast when redirected after auth failure
  useEffect(() => {
    if (searchParams.get('session_expired') === '1') {
      toast.info('Your session expired. Please sign in again.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Redirect to dashboard if already logged in (session persists in localStorage)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCheckingSession(false);
      if (session?.user) {
        navigate('/dashboard', { replace: true });
      }
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data: email, error: lookupError } = await supabase.rpc('get_email_by_employee_code', { code: employeeCode.trim() });
      if (lookupError || !email) {
        toast.error('Invalid employee code');
        setIsLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message || 'Invalid employee code or password');
        setIsLoading(false);
        return;
      }

      // Clear stale session ID so DashboardLayout creates a fresh one
      localStorage.removeItem('b1g_session_id');

      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invalid employee code or password');
    }
    setIsLoading(false);
  };

  const openForgotDialog = () => {
    setForgotCode(employeeCode);
    setForgotEmail('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setShowForgotNew(false);
    setShowForgotConfirm(false);
    setForgotStep(1);
    setForgotVerify(null);
    setForgotHasSelfie(false);
    setForgotOpen(true);
  };

  const validateForgotForm = () => {
    if (!forgotCode.trim()) {
      toast.error('Employee code is required');
      return false;
    }
    if (!forgotEmail.trim()) {
      toast.error('Email is required');
      return false;
    }
    if (forgotNewPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return false;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      toast.error('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleForgotContinue = () => {
    if (!validateForgotForm()) return;
    setForgotVerify(null);
    setForgotHasSelfie(false);
    setForgotStep(2);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotStep !== 2) {
      handleForgotContinue();
      return;
    }
    if (!validateForgotForm()) return;
    if (!forgotVerify) {
      toast.error('Take a selfie and allow location to continue');
      return;
    }

    setForgotSubmitting(true);
    try {
      const result = await forgotPassword(forgotCode, forgotEmail, forgotNewPassword, {
        latitude: forgotVerify.lat,
        longitude: forgotVerify.lng,
        selfie: forgotVerify.photoDataUrl,
        user_agent: navigator.userAgent,
      });
      toast.success(result.message || 'Check your email and click Confirm password update.');
      setEmployeeCode(forgotCode.trim());
      setPassword('');
      setForgotStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    }
    setForgotSubmitting(false);
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen bg-white items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Building2 className="h-12 w-12 text-white" />
            <h1 className="text-4xl font-bold text-white tracking-tight">
              B1G
            </h1>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-4">
            Attendance System
          </h2>
          <p className="text-white/90 text-lg leading-relaxed">
            Track time, manage attendance, and streamline your HR operations with geolocation-powered clock in & out.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex flex-1 items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-black">B1G</span>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-black">Sign In</h2>
            <p className="text-gray-600 mt-1">Enter your employee credentials</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-black font-medium">Employee Code</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="code"
                  placeholder="Employee Code"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="pl-10 border-gray-300 text-black placeholder:text-gray-400"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-black font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 border-gray-300 text-black placeholder:text-gray-400"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-xs text-gray-600">
            Sign in with your company employee code and password.
          </p>
          <p className="text-center text-sm text-gray-600">
            Forgot password?{' '}
            <button
              type="button"
              onClick={openForgotDialog}
              className="text-primary font-medium hover:underline"
            >
              Click here
            </button>
          </p>
        </div>
      </div>

      <Dialog
        open={forgotOpen}
        onOpenChange={(open) => {
          setForgotOpen(open);
          if (!open) {
            setForgotStep(1);
            setForgotVerify(null);
            setForgotHasSelfie(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {forgotStep === 1
                ? 'Set a new password'
                : forgotStep === 2
                  ? 'Verify it is you'
                  : 'Check your Gmail'}
            </DialogTitle>
            <DialogDescription>
              {forgotStep === 1
                ? 'Enter your employee code, the email on your HRIS record, and a new password.'
                : forgotStep === 2
                  ? 'Take a selfie and turn on location. We will email you a Confirm button. Your password will not change until you confirm.'
                  : 'Open Gmail and tap Confirm password update. Your password will not change until you confirm.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            {forgotStep === 1 && (
              <>
            <div className="space-y-2">
              <Label htmlFor="forgot-code">Employee Code</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-code"
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forgot-new">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-new"
                  type={showForgotNew ? 'text' : 'password'}
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowForgotNew((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showForgotNew ? 'Hide password' : 'Show password'}
                >
                  {showForgotNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                At least 6 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="forgot-confirm">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="forgot-confirm"
                  type={showForgotConfirm ? 'text' : 'password'}
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowForgotConfirm((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showForgotConfirm ? 'Hide password' : 'Show password'}
                >
                  {showForgotConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
              </>
            )}
            {forgotStep === 2 && (
              <SelfieLocationCapture
                active={forgotOpen && forgotStep === 2}
                value={forgotVerify}
                onChange={setForgotVerify}
                onHasPhotoChange={setForgotHasSelfie}
              />
            )}
            {forgotStep === 3 && (
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation email. Open Gmail, then tap Confirm password update.
                </p>
              </div>
            )}
            {forgotStep === 3 ? (
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                  Close
                </Button>
                <Button type="button" onClick={openGmailInbox}>
                  <Mail className="h-4 w-4 mr-2" />
                  Open Gmail
                </Button>
              </DialogFooter>
            ) : (
              (forgotStep === 1 || forgotHasSelfie) && (
                <DialogFooter className="gap-2 sm:gap-0">
                  {forgotStep === 2 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForgotStep(1);
                        setForgotVerify(null);
                        setForgotHasSelfie(false);
                      }}
                      disabled={forgotSubmitting}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Back
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotSubmitting}>
                      Cancel
                    </Button>
                  )}
                  {forgotStep === 1 ? (
                    <Button type="submit">
                      Continue
                    </Button>
                  ) : (
                    <Button type="submit" disabled={forgotSubmitting || !forgotVerify}>
                      {forgotSubmitting ? 'Sending...' : 'Send confirmation email'}
                    </Button>
                  )}
                </DialogFooter>
              )
            )}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
