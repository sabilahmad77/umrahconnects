'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { acceptSession } from '@/lib/session';
import { clearAuth, getStoredUser, type StoredUser, type DashboardType } from '@/lib/auth';
import type { PreferencesUpdate, UserPreferences } from '@/lib/preferences';

/** `GET /auth/google/status`. A failed check is treated as "not offered", never as enabled. */
export function useGoogleSignInStatus() {
  return useQuery({
    queryKey: ['auth', 'google-status'],
    queryFn: async () => {
      const { data } = await apiClient.get('/auth/google/status');
      return { enabled: data?.data?.enabled === true, mode: data?.data?.mode === 'local-stub' ? 'local-stub' : 'google' } as const;
    },
    staleTime: 5 * 60_000,
  });
}

export interface AccountProfile {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
  locale: string;
  timezone: string;
  tenant: { id: string; name: string; slug: string; type: string; status: string } | null;
  identities: { provider: string; email: string | null; createdAt: string }[];
}

/** The signed-in account as the server sees it now (`GET /auth/me`): identities, password presence, verification. */
export function useAccountProfile() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await apiClient.get('/auth/me')).data.data as AccountProfile,
  });
}

export function usePreferences() {
  return useQuery({
    queryKey: ['auth', 'preferences'],
    queryFn: async () => (await apiClient.get('/users/me/preferences')).data.data as UserPreferences,
  });
}

/** Saves a partial update; the response is the saved state, so the cache is replaced with the server's readback. */
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (update: PreferencesUpdate) => (await apiClient.put('/users/me/preferences', update)).data.data as UserPreferences,
    onSuccess: (saved) => {
      qc.setQueryData(['auth', 'preferences'], saved);
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

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
