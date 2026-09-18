'use client';

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { acceptSession } from '@/lib/session';
import { clearAuth, getStoredUser, type StoredUser, type DashboardType } from '@/lib/auth';

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
        // The profile (roles, capabilities, verification state) comes from
        // /auth/me, not from the token claims, so the UI is bound to what the
        // server currently grants. The refresh token is an httpOnly cookie that
        // page scripts never see.
        return await acceptSession(data.data.accessToken);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    // Empty body: the API revokes whichever refresh token the httpOnly cookie
    // carries, and clears the cookie. A failure is surfaced to the caller rather
    // than hidden, because the cookie would otherwise silently resume the session.
    await apiClient.post('/auth/logout', {});
    clearAuth();
    window.location.href = '/login';
  }, []);

  const getCurrentUser = useCallback((): StoredUser | null => getStoredUser(), []);

  return { login, logout, getCurrentUser, isLoading };
}

export { type StoredUser, type DashboardType };
