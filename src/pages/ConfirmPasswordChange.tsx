import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmPasswordChange } from '@/lib/edgeFunctions';

const ConfirmPasswordChange = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    token ? 'idle' : 'error'
  );
  const [message, setMessage] = useState(
    token
      ? 'Click the button below to confirm your password update. Your password will not change until you confirm.'
      : 'This confirmation link is missing or invalid.'
  );

  const handleConfirm = async () => {
    if (!token) return;
    setStatus('loading');
    try {
      const result = await confirmPasswordChange(token);
      setStatus('success');
      setMessage(result.message || 'Password updated. You can sign in now.');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unable to confirm password change.');
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <Building2 className="h-12 w-12 text-white" />
            <h1 className="text-4xl font-bold text-white tracking-tight">B1G</h1>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-4">Confirm password update</h2>
          <p className="text-white/90 text-lg leading-relaxed">
            Your password only changes after you confirm this request from your email.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-black">B1G</span>
          </div>

          {status === 'success' ? (
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
            </div>
          ) : status === 'error' ? (
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="h-7 w-7 text-red-600" />
              </div>
            </div>
          ) : null}

          <h2 className="text-2xl font-bold text-black">
            {status === 'success' ? 'Password updated' : 'Confirm password update'}
          </h2>
          <p className="text-sm text-gray-600">{message}</p>

          {status === 'idle' && (
            <Button className="w-full" onClick={handleConfirm}>
              Confirm password update
            </Button>
          )}
          {status === 'loading' && (
            <Button className="w-full" disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming...
            </Button>
          )}

          <p className="text-sm text-gray-600">
            <Link to="/" className="text-primary font-medium hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfirmPasswordChange;
