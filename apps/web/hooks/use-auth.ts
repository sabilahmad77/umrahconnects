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
        const { accessToken, refreshToken } = data.data;

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
          tenantType: decoded?.tenantType ?? 'OPERATOR',
          roles,
          dashboardType,
          displayName: decoded?.email?.split('@')[0] ?? email.split('@')[0],
        };

        setToken(accessToken);
        if (refreshToken) {
          try { localStorage.setItem('refreshToken', refreshToken); } catch {}
        }
        setStoredUser(user);
        return user;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken && !refreshToken.startsWith('demo.')) {
      await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    clearAuth();
    window.location.href = '/login';
  }, []);

  const getCurrentUser = useCallback((): StoredUser | null => getStoredUser(), []);

  return { login, logout, getCurrentUser, isLoading };
}

export { type StoredUser, type DashboardType };
