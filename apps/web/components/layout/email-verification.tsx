'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '@/components/providers/auth-provider';
import { loadSessionUser } from '@/lib/session';
import { apiClient } from '@/lib/api';
import { resendFailure, resendResult, waitText, type ResendResult } from '@/lib/email-verification';
import { Alert, Button } from '@/components/ui/system';

/**
 * Signed-in banner for an unconfirmed email (from `GET /auth/me` →
 * `emailVerified`). Resending respects the server's per-account cooldown, and
 * the profile is re-read when the person comes back to the tab, so confirming
 * in the email's tab unlocks gated features (provider onboarding) here too.
 */
export function EmailVerificationNotice() {
  const { user, setUser } = useAuthContext();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ResendResult | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [stillUnverified, setStillUnverified] = useState(false);
  const unverified = user?.emailVerified === false;

  const refresh = useCallback(async () => {
    const fresh = await loadSessionUser();
    setUser(fresh);
    return fresh;
  }, [setUser]);

  useEffect(() => {
    if (!unverified) return;
    const onFocus = () => void refresh().catch(() => undefined);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [unverified, refresh]);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [waitUntil]);

  if (!unverified) return null;
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const resend = async () => {
    setBusy(true);
    setStillUnverified(false);
    try {
      const { data } = await apiClient.post('/auth/verify-email/request', {});
      const outcome = resendResult(data?.data);
      setResult(outcome);
      if (outcome.kind === 'already-verified') await refresh();
      if (outcome.kind === 'sent') setWaitUntil(Date.now() + 60_000);
    } catch (error) {
      const outcome = resendFailure(error);
      setResult(outcome);
      if (outcome.kind === 'cooldown') setWaitUntil(Date.now() + outcome.seconds * 1000);
    } finally {
      setNow(Date.now());
      setBusy(false);
    }
  };

  const checkAgain = async () => {
    setChecking(true);
    try {
      const fresh = await refresh();
      setStillUnverified(fresh.emailVerified === false);
    } catch {
      setResult({ kind: 'unavailable', message: 'Your account could not be checked right now. Try again.' });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mb-6 space-y-3">
      <Alert tone="info" title="Confirm your email address">
        <p>
          We sent a confirmation link to <strong>{user?.email}</strong>. Confirming it is required before you can register an organization.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button variant="secondary" busy={busy} disabled={secondsLeft > 0} onClick={resend}>
            Resend verification email
          </Button>
          <Button variant="quiet" busy={checking} onClick={checkAgain}>
            I have confirmed it
          </Button>
        </div>
        <div role="status" className="mt-3 space-y-1">
          {result?.kind === 'sent' && <p>A new link is on its way to {user?.email}. It replaces earlier links.</p>}
          {secondsLeft > 0 && <p>You can request another email {waitText(secondsLeft)}.</p>}
          {result?.kind === 'already-verified' && <p>Your email address is already confirmed.</p>}
          {stillUnverified && <p>Your email is not confirmed yet. Open the link in the most recent email, then try again.</p>}
        </div>
      </Alert>
      {result?.kind === 'not-delivered' && (
        <Alert title="Verification email not sent">Email delivery is not available right now. Contact support.</Alert>
      )}
      {result?.kind === 'unavailable' && <Alert title="Verification email not sent">{result.message}</Alert>}
    </div>
  );
}
