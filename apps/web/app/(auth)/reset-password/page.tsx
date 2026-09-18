'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, CheckCircle2 } from 'lucide-react';
import { PASSWORD_HINT, passwordProblem } from '@/lib/password-policy';
import { apiErrorMessage } from '@/lib/api-error';
import { apiClient } from '@/lib/api';
import { clearAuth } from '@/lib/auth';
import { Alert, Button, Input, LoadingState } from '@/components/ui/system';

/** Messages for the API's single-use link codes (auth.service.ts `redeemLink`). */
const LINK_PROBLEMS: Record<string, { title: string; body: string }> = {
  RESET_LINK_USED: {
    title: 'This link was already used',
    body: 'Each reset link works once, and a newer request replaces older links. Request a new link from the sign-in page if you still need one.',
  },
  RESET_LINK_EXPIRED: { title: 'This link has expired', body: 'Reset links work for 30 minutes. Request a new one from the sign-in page.' },
  RESET_LINK_INVALID: { title: 'This link is not valid', body: 'Check that you opened the complete link from the email, or request a new one.' },
};

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [linkProblem, setLinkProblem] = useState<{ title: string; body: string } | null>(null);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    const problem = passwordProblem(password) || (password !== confirm ? 'The passwords do not match.' : '');
    setFieldError(problem);
    if (problem) return;
    setBusy(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      // The server signed out every session of the account; drop any local copy.
      clearAuth();
      setDone(true);
    } catch (e: any) {
      const code = e?.response?.data?.error?.code;
      if (code && LINK_PROBLEMS[code]) setLinkProblem(LINK_PROBLEMS[code]);
      else setError(apiErrorMessage(e, 'Your password could not be updated. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500">
          {done ? <CheckCircle2 className="h-6 w-6 text-white" /> : <KeyRound className="h-6 w-6 text-white" />}
        </div>
        <h1 className="font-heading text-xl font-bold text-gray-900">Choose a new password</h1>
        <p className="mb-6 mt-1 text-sm text-gray-600">Choose a strong password for your Umrah Connect account.</p>

        {done ? (
          <div className="space-y-4">
            <Alert tone="info" title="Password saved">
              Every session of your account was signed out. Sign in with your new password.
            </Alert>
            <Link href="/login?reason=password-set" className="uc-button uc-button-primary">
              Sign in
            </Link>
          </div>
        ) : !token ? (
          <div className="space-y-4">
            <Alert title="Reset link required">Open the link from your password email. The link is missing from this address.</Alert>
            <Link href="/login" className="uc-button uc-button-secondary">
              Back to sign in
            </Link>
          </div>
        ) : linkProblem ? (
          <div className="space-y-4">
            <Alert title={linkProblem.title}>{linkProblem.body}</Alert>
            <Link href="/login" className="uc-button uc-button-primary">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form method="post" onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-sm font-medium">
                New password
              </label>
              <Input id="reset-password" aria-describedby="reset-password-hint" autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!fieldError} />
              <p id="reset-password-hint" className="mt-1 text-xs text-gray-600">
                {PASSWORD_HINT}
              </p>
            </div>
            <div>
              <label htmlFor="reset-confirm" className="mb-2 block text-sm font-medium">
                Confirm new password
              </label>
              <Input id="reset-confirm" autoComplete="new-password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!fieldError} />
            </div>
            {fieldError && <p className="text-sm text-red-700">{fieldError}</p>}
            {error && <Alert title="Password not updated">{error}</Alert>}
            <Button type="submit" busy={busy} className="w-full">
              Save new password
            </Button>
            <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResetForm />
    </Suspense>
  );
}
