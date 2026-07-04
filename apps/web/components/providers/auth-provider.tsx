'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getStoredUser, getToken, clearAuth, isTokenExpired, type StoredUser, type DashboardType } from '@/lib/auth';

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
    const token = getToken();
    const storedUser = getStoredUser();
    const isPublic = isPublicPath(pathname);

    if (token && !isTokenExpired(token) && storedUser) {
      setUserState(storedUser);
      setIsLoaded(true);
      // Only bounce off /login, /register, /forgot-password — let / (landing) stay reachable
      if (shouldBounceLoggedInUser(pathname) && !redirected.current) {
        redirected.current = true;
        router.push(getDashboardPath(storedUser.dashboardType));
      }
    } else {
      // Clear stale auth
      if (token || storedUser) clearAuth();
      setIsLoaded(true);
      // Redirect to login only if on a protected path
      if (!isPublic && !redirected.current) {
        redirected.current = true;
        router.push('/login');
      }
    }
  }, [pathname]); // re-run on route changes

  return (
    <AuthContext.Provider value={{ user, isLoaded, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
