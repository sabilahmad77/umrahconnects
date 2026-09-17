'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredUser, getToken, clearAuth, isTokenExpired, decodeJwt, inferDashboardType, setStoredUser, type StoredUser, type DashboardType } from '@/lib/auth';
import { apiClient, refreshAccessToken } from '@/lib/api';

interface AuthContextValue {
  user: StoredUser | null;
  isLoaded: boolean;
  logout: () => void;
  setUser: (u: StoredUser | null) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  logout: () => {},
  setUser: () => {},
});

export function useAuthContext() {
  return useContext(AuthContext);
}

export function getDashboardPath(dashboardType: DashboardType): string {
  switch (dashboardType) {
    case 'hotel':       return '/hotel-dashboard';
    case 'transport':   return '/transport-dashboard';
    case 'compliance':  return '/visa-dashboard';
    case 'finance':     return '/finance-dashboard';
    case 'pilgrim':     return '/travel-plan';
    case 'admin':       return '/admin-dashboard';
    case 'operator':
    default:            return '/dashboard';
  }
}

// Paths a logged-out user is allowed to view without being bounced to /login
const PUBLIC_PATHS = [
  '/', '/login', '/register', '/signup', '/forgot-password', '/reset-password', '/pilgrim',
  // Public marketing & guest-browse website (Step 1)
  '/solutions', '/pricing', '/about', '/workflow', '/resources', '/security', '/integrations',
  '/help', '/api-docs', '/careers', '/partners', '/contact', '/privacy', '/terms',
  '/marketplace-preview', '/social-preview',
];

// Paths a logged-in user should be PUSHED AWAY from (back to their dashboard).
// Critically: '/' is NOT here — landing must stay reachable for everyone.
const AUTH_ONLY_PUBLIC = ['/login', '/register', '/forgot-password'];

const isPublicPath = (pathname?: string | null) =>
  PUBLIC_PATHS.some((p) => (p === '/' ? pathname === '/' : (pathname === p || pathname?.startsWith(p + '/'))));

const shouldBounceLoggedInUser = (pathname?: string | null) =>
  AUTH_ONLY_PUBLIC.some((p) => (pathname === p || pathname?.startsWith(p + '/')));

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<StoredUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const redirected = useRef(false);

  const setUser = useCallback((u: StoredUser | null) => {
    setUserState(u);
    if (u) {
      try { localStorage.setItem('currentUser', JSON.stringify(u)); } catch {}
    } else {
      try { localStorage.removeItem('currentUser'); } catch {}
    }
  }, []);

  const logout = useCallback(() => {
    // Empty body — the httpOnly refresh cookie identifies the session to revoke.
    void apiClient.post('/auth/logout', {}, { withCredentials: true }).catch(() => {});
    clearAuth();
    setUserState(null);
    redirected.current = false;
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    const storedUser = getStoredUser();
    const isPublic = isPublicPath(pathname);

    const settleLoggedIn = (u: StoredUser) => {
      if (cancelled) return;
      const decoded = decodeJwt(getToken() || '');
      if (!decoded?.sub || !decoded.roles?.length) { bounceToLogin(); return; }
      const boundUser: StoredUser = { ...u, id: decoded.sub, email: decoded.email || u.email, tenantId: decoded.tenantId, tenantType: decoded.tenantType, roles: decoded.roles, dashboardType: inferDashboardType(decoded.roles), displayName: decoded.email?.split('@')[0] || 'Account' };
      setStoredUser(boundUser);
      setUserState(boundUser);
      setIsLoaded(true);
      // Only bounce off /login, /register, /forgot-password — let / (landing) stay reachable
      if (shouldBounceLoggedInUser(pathname) && !redirected.current) {
        redirected.current = true;
        router.push(getDashboardPath(boundUser.dashboardType));
      }
    };

    const bounceToLogin = () => {
      if (cancelled) return;
      if (token || storedUser) clearAuth();
      setIsLoaded(true);
      if (!isPublic && !redirected.current) {
        redirected.current = true;
        // FIX-02: preserve intended destination instead of a silent bounce
        const returnTo = pathname && pathname !== '/login' ? `?returnTo=${encodeURIComponent(pathname + window.location.search)}` : '';
        router.push(`/login${returnTo}`);
      }
    };

    if (token && !isTokenExpired(token) && storedUser) {
      settleLoggedIn(storedUser);
      return () => { cancelled = true; };
    }

    // FIX-02: access token expired/missing but a refresh token + user exist →
    // try a silent refresh BEFORE bouncing (this is the 15-min hard-nav bounce).
    // The refresh token is an httpOnly cookie now, so the page cannot inspect it.
    // A stored user is the signal that a session may be resumable; the refresh
    // call itself decides, and returns null when there is nothing to resume.
    if (storedUser) {
      setIsLoaded(false);
      (async () => {
        const accessToken = await refreshAccessToken(); // shared/coalesced with apiClient
        if (accessToken) settleLoggedIn(storedUser);
        else bounceToLogin();
      })();
      return () => { cancelled = true; };
    }

    bounceToLogin();
    return () => { cancelled = true; };
  }, [pathname, router]); // re-run on route changes

  return (
    <AuthContext.Provider value={{ user, isLoaded, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
