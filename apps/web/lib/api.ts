import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { getToken, setToken, clearAuth } from '@/lib/auth';
import { singleFlight, writeKey } from '@/lib/single-flight';
import { idempotencyKeyFor } from '@/lib/idempotency-key';

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
      // The refresh token lives in an httpOnly cookie the API sets (`uc_rt`, or
      // `__Host-uc_rt` in production). Page scripts cannot read it, which is the
      // point: it used to sit in localStorage where any XSS could lift it. The
      // browser talks to the API same-origin through /proxy-api, so the cookie
      // rides along on its own and the body stays empty.
      const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
      const accessToken = data?.data?.accessToken ?? data?.accessToken;
      if (!accessToken) return null;
      setToken(accessToken);
      try { sessionStorage.setItem('accessToken', accessToken); } catch {}
      try { localStorage.removeItem('refreshToken'); } catch {}
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
  withCredentials: true,
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

/**
 * Endpoints that establish or end a session, or redeem an emailed link. Their
 * 401 means "those credentials / that link are not valid", never "your access
 * token expired", so they must not trigger a refresh-and-retry or a bounce.
 * Every other /auth/* call (me, change-password, logout-all, verify-email
 * resend, Google link intent) is an ordinary authenticated request: skipping
 * the refresh for them failed those actions for anyone who had kept a page
 * open past the 15-minute access-token lifetime.
 */
const CREDENTIAL_ENDPOINTS = [
  '/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/google/exchange',
  '/auth/forgot-password', '/auth/reset-password', '/auth/verify-email/confirm', '/auth/otp/',
];

export function isCredentialEndpoint(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return CREDENTIAL_ENDPOINTS.some((endpoint) => (endpoint.endsWith('/') ? path.startsWith(endpoint) : path === endpoint));
}

/** The sign-in URL after a session truly ended: back to this page afterwards, with the reason shown. */
export function expiredSessionUrl(location: Pick<Location, 'pathname' | 'search'>): string {
  const returnTo = encodeURIComponent(location.pathname + location.search);
  return `/login?reason=session-expired&returnTo=${returnTo}`;
}

// Coalesce refresh for expired real sessions.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (!original || isCredentialEndpoint(original.url) || !getToken()) return Promise.reject(error);
    if (error.response?.status === 401 && error.response?.data?.error?.message?.includes('Organization verification is not complete')) return Promise.reject(error);
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
        clearAuth();
        window.location.href = expiredSessionUrl(window.location);
      }
    }
    return Promise.reject(error);
  },
);

/**
 * N-FORM-1: duplicate submission, in two layers.
 *
 * In this tab, identical writes that overlap in time are joined, so a double
 * click (or a second effect pass) sends one request instead of two
 * (lib/single-flight.ts). That is politeness, not a guarantee: a second tab, a
 * retry after a token refresh or a flaky connection each send their own request.
 *
 * So every create also carries an `Idempotency-Key` the SERVER settles
 * (lib/idempotency-key.ts): the first request creates the record and every
 * duplicate of the same submit attempt gets that first response back. Every
 * screen gets both from the shared client — neither is a per-form fix.
 */
for (const method of ['post', 'put', 'patch'] as const) {
  const send = apiClient[method].bind(apiClient) as (
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ) => Promise<AxiosResponse>;
  apiClient[method] = ((url: string, data?: unknown, config?: AxiosRequestConfig) => {
    const idempotencyKey = idempotencyKeyFor(method, url, data);
    // Kept on the config, so the retry after a token refresh replays the SAME
    // attempt instead of creating a second record.
    const withKey = idempotencyKey
      ? { ...config, headers: { ...config?.headers, 'Idempotency-Key': idempotencyKey } }
      : config;
    return singleFlight(writeKey(method, url, data), () => send(url, data, withKey));
  }) as typeof apiClient.post;
}
const sendDelete = apiClient.delete.bind(apiClient) as (
  url: string,
  config?: AxiosRequestConfig,
) => Promise<AxiosResponse>;
apiClient.delete = ((url: string, config?: AxiosRequestConfig) =>
  singleFlight(writeKey('delete', url, config?.data), () =>
    sendDelete(url, config),
  )) as typeof apiClient.delete;

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } };
