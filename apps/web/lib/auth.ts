// Auth utilities — JWT decode, role detection, dashboard routing

export type UserRole =
  | 'OPERATOR_ADMIN'
  | 'OPERATOR_STAFF'
  | 'HOTEL_OWNER'
  | 'TRANSPORT_MANAGER'
  | 'COMPLIANCE_OFFICER'
  | 'FINANCE_MANAGER'
  | 'SUB_AGENT'
  | 'PILGRIM'
  | 'SUPER_ADMIN';

export interface DecodedToken {
  sub: string;
  email?: string;
  phone?: string;
  tenantId: string;
  tenantType: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface StoredUser {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantType: string;
  roles: string[];
  dashboardType: DashboardType;
  displayName: string;
}

export type DashboardType =
  | 'operator'
  | 'hotel'
  | 'transport'
  | 'compliance'
  | 'finance'
  | 'pilgrim'
  | 'admin';

// ─── Cookie helpers ────────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

// ─── Token storage (cookie-primary, localStorage fallback) ────────────────────

export function getToken(): string | null {
  return getCookie('accessToken') || localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken') || null;
}

export function setToken(token: string) {
  setCookie('accessToken', token, 7);
  try { localStorage.setItem('accessToken', token); } catch {}
  try { sessionStorage.setItem('accessToken', token); } catch {}
}

export function clearToken() {
  deleteCookie('accessToken');
  try { localStorage.removeItem('accessToken'); } catch {}
  try { sessionStorage.removeItem('accessToken'); } catch {}
}

// ─── User storage (cookie-primary) ────────────────────────────────────────────

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') return null;
  try {
    // Try cookie first, then localStorage
    const raw = getCookie('currentUser') || localStorage.getItem('currentUser');
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: StoredUser) {
  const json = JSON.stringify(user);
  setCookie('currentUser', json, 7);
  try { localStorage.setItem('currentUser', json); } catch {}
}

export function clearAuth() {
  deleteCookie('accessToken');
  deleteCookie('currentUser');
  try { localStorage.removeItem('accessToken'); } catch {}
  try { localStorage.removeItem('refreshToken'); } catch {}
  try { localStorage.removeItem('currentUser'); } catch {}
  try { sessionStorage.removeItem('accessToken'); } catch {}
}

// ─── JWT utilities ────────────────────────────────────────────────────────────

/** Decode a JWT payload without verifying signature (client-side only). */
export function decodeJwt(token: string): DecodedToken | null {
  try {
    if (token.startsWith('demo.')) {
      const [, payload] = token.split('.');
      return JSON.parse(atob(payload)) as DecodedToken;
    }
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as DecodedToken;
  } catch {
    return null;
  }
}

/** Map server roles to dashboard type. */
export function inferDashboardType(roles: string[]): DashboardType {
  const r = roles.map((s) => s.toUpperCase());
  if (r.some((x) => x.includes('SUPER_ADMIN'))) return 'admin';
  if (r.some((x) => x.includes('HOTEL'))) return 'hotel';
  if (r.some((x) => x.includes('TRANSPORT'))) return 'transport';
  if (r.some((x) => x.includes('COMPLIANCE') || x.includes('VISA'))) return 'compliance';
  if (r.some((x) => x.includes('FINANCE'))) return 'finance';
  if (r.some((x) => x.includes('PILGRIM'))) return 'pilgrim';
  return 'operator';
}

export function isTokenExpired(token: string): boolean {
  // Demo tokens are always valid
  if (token.startsWith('demo.')) return false;
  const decoded = decodeJwt(token);
  if (!decoded) return true;
  return decoded.exp * 1000 < Date.now();
}
