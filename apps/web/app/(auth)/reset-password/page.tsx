'use client';
import Link from 'next/link';
import { Input, LoadingState , Button } from '@/components/ui/system';


import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    setBusy(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      setDone(true);
      toast.success('Password updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Reset link is invalid or expired');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 w-full max-w-md">
        <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center mb-4">
          {done ? <CheckCircle2 className="h-6 w-6 text-white" /> : <KeyRound className="h-6 w-6 text-white" />}
        </div>
        <h1 className="text-xl font-heading font-bold text-gray-900">Set a new password</h1>
        <p className="text-sm text-gray-600 mt-1 mb-6">Choose a strong password for your Umrah Connect account.</p>
        <Link href="/login" className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Back to sign in</Link>
        {done ? (
          <p className="text-sm text-emerald-600 font-medium">Password updated. You can sign in with your new password.</p>
        ) : !token ? (
          <p className="text-sm text-red-700">Missing reset token. Use the link from your reset email.</p>
        ) : (
          <div className="space-y-4">
            <Input aria-label="Password"
              autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-brand-400"
            />
            <Input aria-label="Confirm"
              autoComplete="new-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-xl outline-none focus:border-brand-400"
            />
            <Button variant="quiet" type="button"
              onClick={submit} disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm rounded-xl disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<LoadingState />}><ResetForm /></Suspense>;
}
