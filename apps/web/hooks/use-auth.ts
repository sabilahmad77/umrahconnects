'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import {
  decodeJwt,
  inferDashboardType,
  setStoredUser,
  setToken,
  clearAuth,
  getStoredUser,
  type StoredUser,
  type DashboardType,
} from '@/lib/auth';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Real production login by email + password. The backend resolves the tenant
   * from the email (tenantId optional), so the user never needs a workspace
   * slug. Tenant + roles are read from the signed JWT. If the same email exists
   * in multiple workspaces the backend returns TENANT_REQUIRED with a tenant
   * list, which callers surface for disambiguation.
   */
  const login = useCallback(
    async (email: string, password: string, tenantId?: string): Promise<StoredUser> => {
      setIsLoading(true);
      try {
        const { data } = await apiClient.post('/auth/login', { email, password, ...(tenantId ? { tenantId } : {}) });
        const { accessToken } = data.data;

        const decoded = decodeJwt(accessToken);
        const roles = decoded?.roles ?? [];
        if (!accessToken || !decoded?.sub || !roles.length) throw new Error('Your account workspace is not ready. Contact support to complete account setup.');
        const dashboardType = inferDashboardType(roles);

        const user: StoredUser = {
          id: decoded?.sub ?? '',
          email,
          tenantId: decoded?.tenantId ?? tenantId ?? '',
          tenantName: '',
          tenantSlug: '',
          // No default: claiming OPERATOR for an unclassified workspace showed a
          // made-up "Workspace type" in Settings. Empty renders "Not provided".
          tenantType: decoded?.tenantType ?? '',
          roles,
          dashboardType,
          displayName: decoded?.email?.split('@')[0] ?? email.split('@')[0],
        };

        setToken(accessToken);
        // The refresh token is never stored by the page: the API returns it as an
        // httpOnly cookie that scripts cannot read.
        setStoredUser(user);
        return user;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    // Empty body: the API revokes whichever refresh token the httpOnly cookie
    // carries, and clears the cookie.
    await apiClient.post('/auth/logout', {}, { withCredentials: true }).catch(() => {});
    clearAuth();
    window.location.href = '/login';
  }, []);

  const getCurrentUser = useCallback((): StoredUser | null => getStoredUser(), []);

  return { login, logout, getCurrentUser, isLoading };
}

export { type StoredUser, type DashboardType };
