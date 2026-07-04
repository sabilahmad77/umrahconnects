import axios from 'axios';
import { getToken } from '@/lib/auth';

// Default to the same-origin proxy (see next.config rewrites) so the app works
// on localhost AND through any tunnel/device without rebuilding when URLs rotate.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/proxy-api';

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
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken } = data.data;
        localStorage.setItem('accessToken', accessToken);
        sessionStorage.setItem('accessToken', accessToken);
        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch {
        // Clear all auth state and redirect to login
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
        // Clear cookies
        document.cookie.split(';').forEach((c) => {
          document.cookie = c.trim().split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        });
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };
