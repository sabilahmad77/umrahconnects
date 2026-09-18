import { apiClient } from './api';
import { clearAuth, decodeJwt, inferDashboardType, setToken, setStoredUser, type StoredUser } from './auth';

/** Bind UI scope to the authenticated server profile, never a stored persona. */
export async function loadSessionUser(): Promise<StoredUser> {
  const { data } = await apiClient.get('/auth/me');
  const profile = data.data;
  if (!profile?.id || !Array.isArray(profile.roles) || !profile.roles.length || !Array.isArray(profile.permissions)) throw new Error('Your account workspace is not ready. Contact support.');
  const user: StoredUser = {
    id: profile.id, email: profile.email ?? '', tenantId: profile.tenant?.id ?? profile.tenantId,
    tenantName: profile.tenant?.name ?? '', tenantSlug: profile.tenant?.slug ?? '', tenantType: profile.tenant?.type ?? profile.tenantType,
    roles: profile.roles, dashboardType: inferDashboardType(profile.roles),
    displayName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email?.split('@')[0] || 'Account',
    permissions: profile.permissions, emailVerified: profile.emailVerified === true, tenantStatus: profile.tenant?.status, hasPassword: profile.hasPassword,
  };
  setStoredUser(user);
  return user;
}

export async function acceptSession(accessToken: string): Promise<StoredUser> {
  const decoded = decodeJwt(accessToken);
  if (!decoded?.sub || !decoded.roles.length) throw new Error('Account setup is incomplete. Contact support.');
  setToken(accessToken);
  try { localStorage.removeItem('refreshToken'); } catch {}
  return loadSessionUser();
}

/**
 * Why the person is on the sign-in page (`/login?reason=`), set by the app when
 * it ended the session on purpose or found it ended. Unknown values show nothing.
 */
export type SignInReason = 'session-expired' | 'password-changed' | 'signed-out-everywhere' | 'password-set';

const SIGN_IN_NOTICES: Record<SignInReason, { tone: 'info'; title: string; body: string }> = {
  'session-expired': {
    tone: 'info',
    title: 'Your session has ended',
    body: 'For your security you were signed out. Sign in again to continue where you left off.',
  },
  'password-changed': {
    tone: 'info',
    title: 'Password changed',
    body: 'Every session, including this one, was signed out. Sign in with your new password.',
  },
  'signed-out-everywhere': {
    tone: 'info',
    title: 'Signed out everywhere',
    body: 'All your sessions on every device have been signed out. Sign in again to continue.',
  },
  'password-set': {
    tone: 'info',
    title: 'Password saved',
    body: 'Sign in with your email and new password.',
  },
};

export function signInNotice(reason: string | null | undefined) {
  return reason && Object.prototype.hasOwnProperty.call(SIGN_IN_NOTICES, reason) ? SIGN_IN_NOTICES[reason as SignInReason] : null;
}

/**
 * Ends the session in this browser after the server revoked it (password
 * changed, signed out everywhere). Local state is cleared first so any request
 * still in flight cannot trigger a refresh-and-redirect of its own.
 */
export function endLocalSession(reason: SignInReason) {
  clearAuth();
  window.location.href = `/login?reason=${reason}`;
}
