'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/components/providers/auth-provider';
import { apiClient, refreshAccessToken } from '@/lib/api';
import { loadSessionUser } from '@/lib/session';
import type { StoredUser } from '@/lib/auth';
import { isPendingOrganization } from '@/lib/workspace-access';

/** Focus and visibility events arrive in bursts; one profile read covers them. */
const MIN_INTERVAL_MS = 2_000;
/** While an organization waits for review, check now and then so approval shows up by itself. */
const PENDING_POLL_MS = 30_000;

/** The parts of the profile that change what the workspace offers. */
function accessSignature(user: StoredUser | null) {
  if (!user) return '';
  return JSON.stringify([
    user.id,
    user.tenantId,
    user.tenantStatus,
    user.emailVerified,
    [...(user.roles ?? [])].sort(),
    [...(user.permissions ?? [])].sort(),
    user.tenantName,
    user.displayName,
  ]);
}

/** Re-reads GET /auth/me, renewing an expired access token once if needed. */
async function readProfile(): Promise<StoredUser> {
  try {
    return await loadSessionUser();
  } catch (error: any) {
    // /auth/* calls are not retried by the API client, so an access token that
    // expired while the tab sat in the background is renewed here.
    if (error?.response?.status === 401 && (await refreshAccessToken())) return loadSessionUser();
    throw error;
  }
}

/**
 * Keeps the workspace's picture of the account's capabilities current.
 *
 * Grants change on the server while a page is open: an administrator revokes a
 * role, a reviewer approves the organization, the account moves to another
 * organization. The profile is read again when the window regains focus or
 * becomes visible, and after any 403 from the API (the clearest sign the page
 * is out of date), so a withdrawn grant disappears from the menu and its pages
 * show the denied state without a manual reload. The API refuses the action
 * regardless; this only stops the UI offering it.
 *
 * It also keeps cached data in its scope: when the account or organization
 * changes (founding an organization replaces the session in place), everything
 * cached for the previous scope is reset rather than shown under the new one.
 */
export function CapabilitySync() {
  const { user, setUser } = useAuthContext();
  const queryClient = useQueryClient();
  const current = useRef(user);
  current.current = user;
  const inFlight = useRef<Promise<void> | null>(null);
  const lastRun = useRef(0);

  const refresh = useCallback(
    (force = false) => {
      if (!current.current) return Promise.resolve();
      if (inFlight.current) return inFlight.current;
      if (!force && Date.now() - lastRun.current < MIN_INTERVAL_MS) return Promise.resolve();
      lastRun.current = Date.now();
      inFlight.current = (async () => {
        try {
          const next = await readProfile();
          if (accessSignature(next) !== accessSignature(current.current)) setUser(next);
        } catch (error: any) {
          // The profile loaded but has no role left (every grant was withdrawn):
          // loadSessionUser refuses it with a plain Error, not an HTTP error.
          // Fail closed: keep the identity, offer nothing.
          const signedIn = current.current;
          if (!error?.isAxiosError && signedIn && (signedIn.permissions?.length || signedIn.roles?.length)) {
            setUser({ ...signedIn, roles: [], permissions: [] });
          }
          // Network or session errors leave the profile as it is; the next API
          // call or navigation re-checks the session through the usual path.
        } finally {
          inFlight.current = null;
        }
      })();
      return inFlight.current;
    },
    [setUser],
  );

  // Window focus and tab visibility.
  useEffect(() => {
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // A 403 (or the pending-organization 401) means the page's idea of the
  // account is stale. The error still reaches the caller unchanged.
  useEffect(() => {
    const id = apiClient.interceptors.response.use(undefined, (error) => {
      const status = error?.response?.status;
      const url = String(error?.config?.url ?? '');
      const pendingRefusal =
        status === 401 && /verification is not complete/i.test(String(error?.response?.data?.error?.message ?? ''));
      if ((status === 403 || pendingRefusal) && !url.startsWith('/auth/')) void refresh(true);
      return Promise.reject(error);
    });
    return () => apiClient.interceptors.response.eject(id);
  }, [refresh]);

  // Waiting for KYC review: pick up the decision without user action.
  const pending = isPendingOrganization(user);
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, PENDING_POLL_MS);
    return () => window.clearInterval(id);
  }, [pending, refresh]);

  // Cached data belongs to one account in one organization.
  const scope = user ? `${user.id}:${user.tenantId}` : null;
  const permissionsKey = user ? [...(user.permissions ?? [])].sort().join(' ') : '';
  const previous = useRef({ scope, permissionsKey });
  useEffect(() => {
    const before = previous.current;
    previous.current = { scope, permissionsKey };
    if (before.scope && scope && before.scope !== scope) {
      void queryClient.resetQueries();
    } else if (before.scope === scope && before.permissionsKey !== permissionsKey) {
      // A grant came or went: requests that failed for lack of it are worth retrying.
      void queryClient.invalidateQueries({ predicate: (query) => query.state.status === 'error' });
    }
  }, [scope, permissionsKey, queryClient]);

  return null;
}
