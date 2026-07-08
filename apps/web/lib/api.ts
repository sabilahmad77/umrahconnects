import axios from 'axios';
import { getToken, setToken } from '@/lib/auth';

// Default to the same-origin proxy (see next.config rewrites) so the app works
// on localhost AND through any tunnel/device without rebuilding when URLs rotate.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/proxy-api';

// FIX-02: a single, shared refresh. Concurrent 401s (and the auth-provider's
// navigation gate) all await ONE in-flight refresh instead of each firing their
// own — this eliminates the race that intermittently bounced users to /login.
let refreshInFlight: Promise<string | null> | null = null;
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
      if (!refreshToken || refreshToken.startsWith('demo.')) return null;
      const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
      const accessToken = data?.data?.accessToken ?? data?.accessToken;
      if (!accessToken) return null;
      setToken(accessToken); // writes cookie (getToken reads cookie first) + localStorage
      try { sessionStorage.setItem('accessToken', accessToken); } catch {}
      if (data?.data?.refreshToken) { try { localStorage.setItem('refreshToken', data.data.refreshToken); } catch {} }
      return accessToken;
    } catch {
      return null;
    } finally {
      // allow the next distinct refresh cycle
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token on every request (cookie-primary)
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-refresh on 401 — skip for demo tokens to avoid redirect loops
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const currentToken = getToken();

    // In demo mode, silently ignore 401s (backend doesn't accept demo tokens)
    if (currentToken?.startsWith('demo.')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      // Coalesced refresh — shared with the auth-provider nav gate.
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      }
      // Genuine auth failure (no/invalid refresh token). Redirect with returnTo so
      // the user resumes their page after re-login, instead of a silent bounce.
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
        document.cookie.split(';').forEach((c) => {
          document.cookie = c.trim().split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        });
        const returnTo = encodeURIComponent(window.location.pathname);
        window.location.href = `/login?returnTo=${returnTo}`;
      }
    }
    return Promise.reject(error);
  },
);

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };
