import { apiClient } from './api';
import { decodeJwt, inferDashboardType, setToken, setStoredUser, type StoredUser } from './auth';

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
