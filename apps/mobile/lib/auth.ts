import AsyncStorage from '@react-native-async-storage/async-storage';

export type DashboardType =
  | 'operator'
  | 'hotel'
  | 'transport'
  | 'compliance'
  | 'finance'
  | 'admin'
  | 'pilgrim';

export type StoredUser = {
  id: string;
  email: string;
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  tenantType?: string;
  roles?: string[];
  dashboardType: DashboardType;
  displayName?: string;
};

const KEY_TOKEN = 'umrah.accessToken';
const KEY_REFRESH = 'umrah.refreshToken';
const KEY_USER = 'umrah.currentUser';

export async function getToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY_TOKEN); } catch { return null; }
}
export async function setToken(token: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY_TOKEN, token); } catch {}
}
export async function clearToken(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY_TOKEN); } catch {}
}
export async function getRefreshToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY_REFRESH); } catch { return null; }
}
export async function setRefreshToken(token: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY_REFRESH, token); } catch {}
}
export async function getStoredUser(): Promise<StoredUser | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_USER);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch { return null; }
}
export async function setStoredUser(user: StoredUser): Promise<void> {
  try { await AsyncStorage.setItem(KEY_USER, JSON.stringify(user)); } catch {}
}
export async function logout(): Promise<void> {
  try { await AsyncStorage.multiRemove([KEY_TOKEN, KEY_REFRESH, KEY_USER]); } catch {}
}

/** Map backend role strings → dashboard type. Mirrors apps/web/lib/auth.ts. */
export function inferDashboardType(roles: string[] | undefined | null): DashboardType {
  const r = (roles ?? []).map((x) => String(x).toUpperCase());
  if (r.some((x) => x.includes('SUPER_ADMIN') || x.includes('PLATFORM_ADMIN'))) return 'admin';
  if (r.some((x) => x.includes('HOTEL'))) return 'hotel';
  if (r.some((x) => x.includes('TRANSPORT') || x.includes('DRIVER'))) return 'transport';
  if (r.some((x) => x.includes('COMPLIANCE') || x.includes('VISA'))) return 'compliance';
  if (r.some((x) => x.includes('FINANCE') || x.includes('ACCOUNTANT'))) return 'finance';
  if (r.some((x) => x.includes('PILGRIM'))) return 'pilgrim';
  return 'operator';
}

/**
 * Where to land after sign-in.
 *
 * IMPORTANT: every role lands on `/(tabs)` so the bottom tab bar is always
 * present. The role-aware "More" tab shows each role's specific modules
 * (Hotels, Transport, Compliance, Marketplace, Social, etc.). Without this,
 * Hotel/Transport/Compliance/Finance users were dumped onto a stack-pushed
 * dead-end screen with no way to navigate to other modules.
 */
export function getDashboardPath(dt: DashboardType): string {
  // Keep param-typed for future role-specific landings, but always return tabs
  void dt;
  return '/(tabs)';
}
