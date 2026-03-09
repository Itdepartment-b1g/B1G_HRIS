import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Building2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const Login = () => {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const navigate = useNavigate();

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
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
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
        </div>
      </div>
    </div>
  );
};

export default Login;
