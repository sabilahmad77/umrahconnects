import { apiClient } from './api';
import { safeReturnPath } from './safe-return-path';

/**
 * Google Sign-In, browser side (XT-R06, decision D-015).
 *
 * The API runs the whole OpenID Connect flow. The browser only:
 *  1. navigates to /proxy-api/auth/google/start (full page, so the API can set
 *     its signed state cookie and redirect to Google);
 *  2. lands on /auth/callback with a one-time ticket in the URL fragment, which
 *     it removes from the address bar at once and exchanges for a session;
 *  3. or lands on /login?error=… (sign-in) or /settings?linkError=… (linking).
 */

export type GoogleErrorCode =
  | 'google_unavailable'
  | 'google_state'
  | 'google_failed'
  | 'google_cancelled'
  | 'google_email_unverified'
  | 'google_account_ambiguous'
  | 'google_privileged_account'
  | 'google_account_disabled'
  | 'google_already_linked';

export interface GoogleMessage {
  title: string;
  body: string;
  /** Cancelling is a choice, not a failure — shown as information. */
  tone: 'error' | 'info';
}

const MESSAGES: Record<GoogleErrorCode, GoogleMessage> = {
  google_cancelled: {
    tone: 'info',
    title: 'Google sign-in was cancelled',
    body: 'Nothing was changed. Continue with Google again, or sign in with your email and password.',
  },
  google_unavailable: {
    tone: 'error',
    title: 'Google sign-in is not available',
    body: 'Google sign-in is not set up on this service right now. Sign in with your email and password.',
  },
  google_state: {
    tone: 'error',
    title: 'Google sign-in expired',
    body: 'The sign-in took too long or was opened in another browser tab. Start again from this page.',
  },
  google_failed: {
    tone: 'error',
    title: 'Google sign-in could not be completed',
    body: 'Google did not confirm your sign-in. Try again, or sign in with your email and password.',
  },
  google_email_unverified: {
    tone: 'error',
    title: 'Your Google email is not verified',
    body: 'Google has not verified the email address on this Google account, so it cannot be used to sign in. Verify it with Google or use another account.',
  },
  google_account_ambiguous: {
    tone: 'error',
    title: 'Sign in with your password instead',
    body: 'This email belongs to more than one Umrah Connect workspace, so Google cannot tell which one you mean. Sign in with your email and password and choose the workspace.',
  },
  google_privileged_account: {
    tone: 'error',
    title: 'Google sign-in is not allowed for this account',
    body: 'Platform administrator accounts must sign in with their email and password.',
  },
  google_account_disabled: {
    tone: 'error',
    title: 'This account cannot sign in',
    body: 'The account or its organization is locked, suspended or closed. Contact your administrator or Umrah Connect support.',
  },
  google_already_linked: {
    tone: 'error',
    title: 'That Google account is already in use',
    body: 'This Google account is already linked to a different Umrah Connect account. Sign in to that account, or choose another Google account.',
  },
};

const LINK_MESSAGES: Partial<Record<GoogleErrorCode, GoogleMessage>> = {
  google_cancelled: { tone: 'info', title: 'Linking was cancelled', body: 'Your account was not changed.' },
  google_state: { tone: 'error', title: 'Linking expired', body: 'The link request expired or was already used. Start linking again.' },
};

export function isGoogleErrorCode(value: unknown): value is GoogleErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MESSAGES, value);
}

/** The message for `/login?error=` (sign-in) or `/settings?linkError=` (linking); null for anything unknown. */
export function googleErrorMessage(code: string | null | undefined, flow: 'sign-in' | 'link' = 'sign-in'): GoogleMessage | null {
  if (!isGoogleErrorCode(code)) return null;
  return (flow === 'link' ? LINK_MESSAGES[code] : undefined) ?? MESSAGES[code];
}

/** Where the "Continue with Google" button navigates. Only same-site paths survive as returnTo. */
export function googleStartUrl(returnTo?: string | null): string {
  const safe = safeReturnPath(returnTo ?? null);
  return `/proxy-api/auth/google/start${safe ? `?returnTo=${encodeURIComponent(safe)}` : ''}`;
}

/** Where account settings navigates after `POST /auth/google/link-intent`. */
export function googleLinkUrl(intent: string): string {
  return `/proxy-api/auth/google/start?intent=${encodeURIComponent(intent)}`;
}

export type GoogleOutcome = 'created' | 'linked' | 'linked_password_removed';

export interface CallbackFragment {
  ticket: string | null;
  returnTo: string | null;
  outcome: GoogleOutcome | null;
}

/** Parses `#ticket=…&returnTo=…&outcome=…`. Unsafe destinations and unknown outcomes are dropped. */
export function parseCallbackFragment(hash: string): CallbackFragment {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const ticket = params.get('ticket');
  const outcome = params.get('outcome');
  return {
    ticket: ticket && /^[\w-]{20,200}$/.test(ticket) ? ticket : null,
    returnTo: safeReturnPath(params.get('returnTo')),
    outcome: outcome === 'created' || outcome === 'linked' || outcome === 'linked_password_removed' ? outcome : null,
  };
}

/**
 * Reads the fragment and immediately removes it from the address bar and
 * history, so the one-time ticket cannot be bookmarked, shared, synced or
 * replayed from history. Next's history state is kept so its router keeps working.
 */
export function takeCallbackFragment(win: Pick<Window, 'location' | 'history'> = window): CallbackFragment {
  const fragment = parseCallbackFragment(win.location.hash);
  if (win.location.hash) {
    win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search);
  }
  return fragment;
}

export interface GoogleSession {
  accessToken: string;
}

const exchanges = new Map<string, Promise<GoogleSession>>();

/**
 * Exchanges the ticket for a session exactly once per page load, however many
 * times the effect runs (React strict mode mounts twice in development, and a
 * second POST would find the single-use ticket spent and show a false error).
 */
export function exchangeTicketOnce(ticket: string): Promise<GoogleSession> {
  let pending = exchanges.get(ticket);
  if (!pending) {
    pending = apiClient.post('/auth/google/exchange', { ticket }).then(({ data }) => {
      const accessToken = data?.data?.accessToken;
      if (typeof accessToken !== 'string' || !accessToken) throw new Error('The sign-in response was incomplete.');
      return { accessToken };
    });
    exchanges.set(ticket, pending);
  }
  return pending;
}

/** Lets a retry after a network failure send the ticket again (it is only spent if the server received it). */
export function forgetTicketExchange(ticket: string) {
  exchanges.delete(ticket);
}

/** Test-only: forget every exchange. */
export function resetTicketExchanges() {
  exchanges.clear();
}

export type ExchangeFailure = 'expired' | 'network' | 'account' | 'unknown';

/** Why an exchange failed: a spent ticket needs a restart, a network failure can be retried. */
export function classifyExchangeFailure(error: unknown): ExchangeFailure {
  const failure = error as { request?: unknown; response?: { status?: number; data?: { error?: { code?: string } } } };
  if (!failure?.response) return failure?.request ? 'network' : 'unknown';
  if (failure.response.data?.error?.code === 'OAUTH_TICKET_INVALID') return 'expired';
  if (failure.response.status === 401 || failure.response.status === 403) return 'account';
  return 'unknown';
}
