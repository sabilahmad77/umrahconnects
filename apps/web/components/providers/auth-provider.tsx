'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredUser, getToken, clearAuth, isTokenExpired, type StoredUser, type DashboardType } from '@/lib/auth';
import { refreshAccessToken } from '@/lib/api';

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
    case 'pilgrim':     return '/social';
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
  PUBLIC_PATHS.some((p) => (p === '/' ? pathname === '/' : pathname?.startsWith(p)));

const shouldBounceLoggedInUser = (pathname?: string | null) =>
  AUTH_ONLY_PUBLIC.some((p) => pathname?.startsWith(p));

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
      setUserState(u);
      setIsLoaded(true);
      // Only bounce off /login, /register, /forgot-password — let / (landing) stay reachable
      if (shouldBounceLoggedInUser(pathname) && !redirected.current) {
        redirected.current = true;
        router.push(getDashboardPath(u.dashboardType));
      }
    };

    const bounceToLogin = () => {
      if (cancelled) return;
      if (token || storedUser) clearAuth();
      setIsLoaded(true);
      if (!isPublic && !redirected.current) {
        redirected.current = true;
        // FIX-02: preserve intended destination instead of a silent bounce
        const returnTo = pathname && pathname !== '/login' ? `?returnTo=${encodeURIComponent(pathname)}` : '';
        router.push(`/login${returnTo}`);
      }
    };

    if (token && !isTokenExpired(token) && storedUser) {
      settleLoggedIn(storedUser);
      return () => { cancelled = true; };
    }

    // FIX-02: access token expired/missing but a refresh token + user exist →
    // try a silent refresh BEFORE bouncing (this is the 15-min hard-nav bounce).
    const refreshToken = (() => { try { return localStorage.getItem('refreshToken'); } catch { return null; } })();
    if (storedUser && refreshToken && !refreshToken.startsWith('demo.')) {
      setIsLoaded(false);
      (async () => {
        const accessToken = await refreshAccessToken(); // shared/coalesced with apiClient
        if (accessToken) settleLoggedIn(storedUser);
        else bounceToLogin();
      })();
      return () => { cancelled = true; };
    }

    // Demo sessions: token may be a client persona with no refresh — keep the user
    // on their page rather than bouncing mid-demo.
    if (storedUser && (refreshToken?.startsWith('demo.') || token)) {
      settleLoggedIn(storedUser);
      return () => { cancelled = true; };
    }

    bounceToLogin();
    return () => { cancelled = true; };
  }, [pathname]); // re-run on route changes

  return (
    <AuthContext.Provider value={{ user, isLoaded, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
