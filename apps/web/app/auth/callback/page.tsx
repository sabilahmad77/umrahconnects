'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptSession } from '@/lib/session';
import { apiErrorMessage } from '@/lib/api-error';
import type { StoredUser } from '@/lib/auth';
import {
  classifyExchangeFailure,
  exchangeTicketOnce,
  forgetTicketExchange,
  takeCallbackFragment,
  type CallbackFragment,
  type ExchangeFailure,
  type GoogleOutcome,
} from '@/lib/google-sign-in';
import { useAuthContext } from '@/components/providers/auth-provider';
import { landingPathFor } from '@/lib/workspace-access';
import { Brandmark } from '@/components/public/public-chrome';
import { Alert, Button, LoadingState } from '@/components/ui/system';

type State =
  | { kind: 'working' }
  | { kind: 'welcome'; outcome: GoogleOutcome; user: StoredUser; destination: string }
  | { kind: 'error'; failure: ExchangeFailure | 'missing'; message: string };

const FAILURE_TEXT: Record<ExchangeFailure | 'missing', string> = {
  missing: 'This sign-in link is incomplete or was already used. Start Google sign-in again from the sign-in page.',
  expired: 'This Google sign-in has expired or was already completed. Start Google sign-in again.',
  network: 'We could not reach Umrah Connect to finish signing you in. Check your connection and try again.',
  account: 'This account cannot be signed in right now.',
  unknown: 'Google sign-in could not be completed. Return to the sign-in page and try again.',
};

function welcomeText(outcome: GoogleOutcome, user: StoredUser) {
  const email = user.email || 'your Google email';
  if (outcome === 'created') {
    return {
      title: `Welcome to Umrah Connect, ${user.displayName.split(' ')[0]}`,
      body: `Your Traveler account was created with your Google account (${email}). Add your phone number, nationality and travel preferences to your profile so the operators you book with can prepare your journey — you can also do this later.`,
    };
  }
  if (outcome === 'linked_password_removed') {
    return {
      title: 'Google is now linked to your account',
      body: `You signed in to your existing account (${email}) with Google. Its email address had never been confirmed, so for your security the password that was set on it was removed and its other sessions were signed out. Sign in with Google from now on, or set a new password in Account settings.`,
    };
  }
  return {
    title: 'Google is now linked to your account',
    body: `You signed in to your existing account (${email}) with Google. From now on you can sign in with Google or with your password.`,
  };
}

/**
 * Google Sign-In landing page. The API redirects here with a single-use,
 * 2-minute ticket in the URL fragment (never sent to a server). The fragment is
 * removed from the address bar before anything else happens, the ticket is
 * exchanged exactly once, and the session is established exactly like a
 * password sign-in.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { setUser } = useAuthContext();
  const fragment = useRef<CallbackFragment | null>(null);
  const started = useRef(false);
  const session = useRef<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'working' });

  const complete = useCallback(async () => {
    const current = fragment.current;
    if (!current?.ticket) {
      setState({ kind: 'error', failure: 'missing', message: FAILURE_TEXT.missing });
      return;
    }
    setState({ kind: 'working' });
    try {
      // A retry after the profile load failed must not spend the ticket again.
      const accessToken = session.current ?? (await exchangeTicketOnce(current.ticket)).accessToken;
      session.current = accessToken;
      const user = await acceptSession(accessToken);
      setUser(user);
      const destination = current.returnTo ?? landingPathFor(user);
      if (current.outcome) setState({ kind: 'welcome', outcome: current.outcome, user, destination });
      else router.replace(destination);
    } catch (error) {
      const failure = classifyExchangeFailure(error);
      // Only a request that never reached the server leaves the ticket unspent.
      if (failure === 'network' && !session.current) forgetTicketExchange(current.ticket);
      const message = failure === 'account' || failure === 'unknown' ? apiErrorMessage(error, FAILURE_TEXT[failure]) : FAILURE_TEXT[failure];
      setState({ kind: 'error', failure, message });
    }
  }, [router, setUser]);

  useEffect(() => {
    // Strict mode runs this effect twice in development; the ticket is spent on first use.
    if (started.current) return;
    started.current = true;
    fragment.current = takeCallbackFragment();
    void complete();
  }, [complete]);

  return (
    <main className="flex min-h-dvh flex-col bg-ivory px-4 py-8">
      <div className="mx-auto w-full max-w-6xl">
        <Brandmark />
      </div>
      <section className="uc-card mx-auto my-auto w-full max-w-md space-y-5 p-6 sm:p-8" aria-labelledby="callback-title" aria-live="polite">
        {state.kind === 'working' && (
          <>
            <h1 id="callback-title" className="text-2xl font-bold text-brand-600">
              Completing sign-in
            </h1>
            <LoadingState label="Completing Google sign-in…" />
          </>
        )}

        {state.kind === 'welcome' && (
          <>
            <h1 id="callback-title" className="text-2xl font-bold text-brand-600">
              {welcomeText(state.outcome, state.user).title}
            </h1>
            <p className="text-sm leading-6 text-gray-700">{welcomeText(state.outcome, state.user).body}</p>
            <div className="flex flex-wrap gap-3">
              {state.outcome === 'created' && (
                <Link href="/profile" className="uc-button uc-button-primary">
                  Complete your profile
                </Link>
              )}
              {state.outcome === 'linked_password_removed' && (
                <Link href="/settings" className="uc-button uc-button-primary">
                  Account settings
                </Link>
              )}
              <Button variant={state.outcome === 'linked' ? 'primary' : 'secondary'} onClick={() => router.replace(state.destination)}>
                Continue
              </Button>
            </div>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 id="callback-title" className="text-2xl font-bold text-brand-600">
              Sign-in not completed
            </h1>
            <Alert title="Unable to sign in with Google">{state.message}</Alert>
            <div className="flex flex-wrap gap-3">
              {state.failure === 'network' && (
                <Button onClick={() => void complete()}>Try again</Button>
              )}
              <Link href="/login" className={state.failure === 'network' ? 'uc-button uc-button-secondary' : 'uc-button uc-button-primary'}>
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
