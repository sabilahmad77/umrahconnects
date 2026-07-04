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

const DEMO_USERS: Record<DashboardType, StoredUser> = {
  operator: {
    id: 'demo-operator',
    email: 'admin@alharamain.sa',
    tenantId: 'demo-tenant',
    tenantName: 'Al Haramain Tours',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'OPERATOR',
    roles: ['OPERATOR_ADMIN'],
    dashboardType: 'operator',
    displayName: 'Ahmad Operator',
  },
  hotel: {
    id: 'demo-hotel',
    email: 'hotel@alharamain.sa',
    tenantId: 'demo-tenant',
    tenantName: 'Al Haramain Tours',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'HOTEL',
    roles: ['HOTEL_OWNER'],
    dashboardType: 'hotel',
    displayName: 'Fatima Hotel Mgr',
  },
  transport: {
    id: 'demo-transport',
    email: 'transport@alharamain.sa',
    tenantId: 'demo-tenant',
    tenantName: 'Al Haramain Tours',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'TRANSPORT',
    roles: ['TRANSPORT_MANAGER'],
    dashboardType: 'transport',
    displayName: 'Omar Transport Mgr',
  },
  compliance: {
    id: 'demo-compliance',
    email: 'visa@alharamain.sa',
    tenantId: 'demo-tenant',
    tenantName: 'Al Haramain Tours',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'COMPLIANCE',
    roles: ['COMPLIANCE_OFFICER'],
    dashboardType: 'compliance',
    displayName: 'Sara Visa Officer',
  },
  finance: {
    id: 'demo-finance',
    email: 'finance@alharamain.sa',
    tenantId: 'demo-tenant',
    tenantName: 'Al Haramain Tours',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'FINANCE',
    roles: ['FINANCE_MANAGER'],
    dashboardType: 'finance',
    displayName: 'Khalid Finance Mgr',
  },
  admin: {
    id: 'demo-admin',
    email: 'superadmin@umrahconnects.io',
    tenantId: 'demo-tenant',
    tenantName: 'Umrah Connects HQ',
    tenantSlug: 'al-haramain-ksa',
    tenantType: 'OPERATOR',
    roles: ['SUPER_ADMIN'],
    dashboardType: 'admin',
    displayName: 'Super Admin',
  },
  pilgrim: {
    id: 'demo-pilgrim',
    email: '',
    tenantId: '',
    tenantName: '',
    tenantSlug: '',
    tenantType: 'PILGRIM',
    roles: ['PILGRIM'],
    dashboardType: 'pilgrim',
    displayName: 'Nur Pilgrim',
  },
};

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);

  /** Real login — resolves slug → login → JWT decode */
  const login = useCallback(
    async (tenantSlug: string, email: string, password: string): Promise<StoredUser> => {
      setIsLoading(true);
      try {
        const tenantRes = await apiClient.get(`/tenants/slug/${tenantSlug}`);
        const { id: tenantId, name: tenantName, slug } = tenantRes.data.data;

        const { data } = await apiClient.post('/auth/login', { tenantId, email, password });
        const { accessToken, refreshToken } = data.data;

        const decoded = decodeJwt(accessToken);
        const roles = decoded?.roles ?? [];
        const dashboardType = inferDashboardType(roles);

        const user: StoredUser = {
          id: decoded?.sub ?? '',
          email,
          tenantId,
          tenantName,
          tenantSlug: slug,
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

  /**
   * Demo login — logs in as the seeded admin behind the scenes (so the real
   * backend accepts every API call and writes go through), but overrides the
   * UI's dashboardType / displayName / email to the demo persona the user picked.
   *
   * Without this, demo users get 401 on every protected endpoint and the UI
   * shows "Failed to load X" everywhere.
   */
  const loginAsDemo = useCallback(async (dashboardType: DashboardType): Promise<StoredUser> => {
    setIsLoading(true);
    try {
      const persona = DEMO_USERS[dashboardType];

      // 1) Real API login as the seeded admin
      const tenantSlug = 'al-haramain-ksa';
      const tenantRes = await apiClient.get(`/tenants/slug/${tenantSlug}`);
      const t = tenantRes.data?.data ?? tenantRes.data;
      const tenantId = t?.id;
      if (!tenantId) throw new Error('Demo workspace not found');

      const loginRes = await apiClient.post('/auth/login', {
        tenantId,
        email: 'admin@alharamain.sa',
        password: 'Admin@1234',
      });
      const payload = loginRes.data?.data ?? loginRes.data;
      const { accessToken, refreshToken } = payload;
      if (!accessToken) throw new Error('Demo login failed');

      // 2) Persist real tokens
      setToken(accessToken);
      if (refreshToken) {
        try { localStorage.setItem('refreshToken', refreshToken); } catch {}
      }

      // 3) Show the persona the user picked (but the session is real)
      const decoded = decodeJwt(accessToken);
      const user: StoredUser = {
        ...persona,
        // Use the real backend identifiers so writes work
        id: decoded?.sub ?? persona.id,
        tenantId,
        tenantSlug: t?.slug ?? tenantSlug,
        tenantName: t?.name ?? persona.tenantName,
        tenantType: decoded?.tenantType ?? persona.tenantType,
        // Keep the persona display + dashboardType (so the UI looks like the role they picked)
        dashboardType,
        displayName: persona.displayName,
        email: persona.email,
        roles: persona.roles,
      };
      setStoredUser(user);
      return user;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken && !refreshToken.startsWith('demo.')) {
      await apiClient.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    clearAuth();
    window.location.href = '/login';
  }, []);

  const getCurrentUser = useCallback((): StoredUser | null => getStoredUser(), []);

  return { login, loginAsDemo, logout, getCurrentUser, isLoading };
}

export { type StoredUser, type DashboardType };
