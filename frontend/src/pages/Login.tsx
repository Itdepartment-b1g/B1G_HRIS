import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { employees } from '@/data/mockData';
import { toast } from 'sonner';

const Login = () => {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate login with hardcoded data
    setTimeout(() => {
      const found = employees.find(
        (emp) => emp.employee_code.toLowerCase() === employeeCode.toLowerCase()
      );

      if (found && password === 'password123') {
        localStorage.setItem('hris_user', JSON.stringify(found));
        toast.success(`Welcome back, ${found.first_name}!`);
        navigate('/dashboard');
      } else {
        toast.error('Invalid employee code or password');
      }
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 login-gradient items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Building2 className="h-12 w-12 text-primary-foreground" />
            <h1 className="text-4xl font-bold text-primary-foreground tracking-tight">
              B1G
            </h1>
          </div>
          <h2 className="text-2xl font-semibold text-primary-foreground/90 mb-4">
            Attendance System
          </h2>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            Track time, manage attendance, and streamline your HR operations with geolocation-powered clock in & out.
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">B1G</span>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Sign In</h2>
            <p className="text-muted-foreground mt-1">Enter your employee credentials</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code" className="text-foreground">Employee Code</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="code"
                  placeholder="EMP-001"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Use <span className="font-mono text-foreground">EMP-001</span> / <span className="font-mono text-foreground">password123</span> to test
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
