'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { loadSessionUser } from '@/lib/session';
import {
  CONFIRM_TEXT,
  confirmFailureState,
  resendFailure,
  resendResult,
  waitText,
  type ConfirmState,
  type ResendResult,
} from '@/lib/email-verification';
import { useAuthContext, getDashboardPath } from '@/components/providers/auth-provider';
import { Brandmark } from '@/components/public/public-chrome';
import { Alert, Button, LoadingState } from '@/components/ui/system';

/**
 * `/verify-email?token=` — the link in the verification email.
 *
 * Confirming takes one deliberate click rather than happening on page load:
 * mail scanners open links automatically, and a single-use link must not be
 * spent by a robot. The page never shows the token.
 */
export default function VerifyEmailPage() {
  const { user, isLoaded, setUser } = useAuthContext();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConfirmState | null>(null);
  const [resend, setResend] = useState<ResendResult | null>(null);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const confirm = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      await apiClient.post('/auth/verify-email/confirm', { token });
      setResult({ kind: 'confirmed' });
    } catch (error) {
      setResult(confirmFailureState(error));
    } finally {
      setBusy(false);
    }
  };

  // A signed-in person's profile is refreshed so features that need a confirmed
  // email (provider onboarding) unlock without signing in again.
  useEffect(() => {
    if (!user || (result?.kind !== 'confirmed' && result?.kind !== 'already-confirmed')) return;
    let active = true;
    loadSessionUser()
      .then((fresh) => active && setUser(fresh))
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per result, not on every profile update
  }, [result]);

  const requestNew = async () => {
    setResending(true);
    try {
      const { data } = await apiClient.post('/auth/verify-email/request', {});
      setResend(resendResult(data?.data));
    } catch (error) {
      setResend(resendFailure(error));
    } finally {
      setResending(false);
    }
  };

  const needsNewLink = result?.kind === 'used' || result?.kind === 'expired' || result?.kind === 'invalid' || token === '';
  const done = result?.kind === 'confirmed' || result?.kind === 'already-confirmed';

  return (
    <main className="flex min-h-dvh flex-col bg-ivory px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <Brandmark />
      </div>
      <section className="uc-card mx-auto my-auto w-full max-w-md space-y-5 p-6 sm:p-8" aria-labelledby="verify-title">
        <h1 id="verify-title" className="text-2xl font-bold text-brand-600">
          Confirm your email
        </h1>

        {token === null && <LoadingState label="Reading your link…" />}

        {token === '' && (
          <Alert title="Verification link required">
            Open the link from your verification email. The link is missing from this address.
          </Alert>
        )}

        {token && !result && (
          <>
            <p className="text-sm leading-6 text-gray-700">Confirm that this email address belongs to you.</p>
            <Button busy={busy} onClick={confirm} className="w-full">
              Confirm email address
            </Button>
          </>
        )}

        {result && result.kind !== 'unavailable' && (
          <Alert tone={CONFIRM_TEXT[result.kind].tone} title={CONFIRM_TEXT[result.kind].title}>
            {CONFIRM_TEXT[result.kind].body}
          </Alert>
        )}
        {result?.kind === 'unavailable' && (
          <>
            <Alert title="Email not confirmed yet">{result.message}</Alert>
            <Button busy={busy} onClick={confirm}>
              Try again
            </Button>
          </>
        )}

        {needsNewLink && isLoaded && user && !user.emailVerified && (
          <div className="space-y-3">
            <Button variant="secondary" busy={resending} onClick={requestNew}>
              Send a new verification email
            </Button>
            {resend?.kind === 'sent' && (
              <Alert tone="info" title="Verification email sent">
                Check the inbox of {user.email}. The new link replaces earlier ones.
              </Alert>
            )}
            {resend?.kind === 'not-delivered' && (
              <Alert title="Email not sent">Email delivery is not available right now. Contact support.</Alert>
            )}
            {resend?.kind === 'cooldown' && (
              <Alert tone="info" title="Please wait a moment">
                A verification email was sent recently. You can request another {waitText(resend.seconds)}.
              </Alert>
            )}
            {resend?.kind === 'already-verified' && (
              <Alert tone="info" title="Already confirmed">
                Your email address is already confirmed.
              </Alert>
            )}
            {resend?.kind === 'unavailable' && <Alert title="Email not sent">{resend.message}</Alert>}
          </div>
        )}
        {needsNewLink && isLoaded && !user && (
          <p className="text-sm text-gray-700">
            <Link href="/login?returnTo=%2Fsettings" className="font-semibold text-brand-700 underline">
              Sign in
            </Link>{' '}
            to request a new verification email.
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-5">
          {user ? (
            <Link href={getDashboardPath(user.dashboardType)} className={done ? 'uc-button uc-button-primary' : 'uc-button uc-button-secondary'}>
              Continue to your workspace
            </Link>
          ) : (
            <Link href="/login" className={done ? 'uc-button uc-button-primary' : 'uc-button uc-button-secondary'}>
              {done ? 'Sign in to continue' : 'Back to sign in'}
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
