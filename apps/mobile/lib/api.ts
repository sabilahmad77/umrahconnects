import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getRefreshToken, getToken, logout, setToken } from './auth';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://printing-knowledgestorm-belt-galaxy.trycloudflare.com/api/v1';

export const apiBaseURL = API_URL;

// ── Runtime API URL override ───────────────────────────────────────────────────
// Tunnel URLs rotate on every restart; a baked URL would orphan the APK.
// The override (set from the login screen) persists and survives rebuilds.
const API_OVERRIDE_KEY = 'uc.apiBaseUrl';

export async function getApiOverride(): Promise<string | null> {
  try { return await AsyncStorage.getItem(API_OVERRIDE_KEY); } catch { return null; }
}

export async function setApiOverride(url: string | null): Promise<void> {
  const clean = (url ?? '').trim().replace(/\/+$/, '');
  if (!clean) {
    await AsyncStorage.removeItem(API_OVERRIDE_KEY);
    apiClient.defaults.baseURL = API_URL;
    return;
  }
  const base = clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
  await AsyncStorage.setItem(API_OVERRIDE_KEY, base);
  apiClient.defaults.baseURL = base;
}

/** Apply any persisted override — call once at app start. */
export async function initApiBaseURL(): Promise<string> {
  const o = await getApiOverride();
  if (o) apiClient.defaults.baseURL = o;
  return apiClient.defaults.baseURL ?? API_URL;
}

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? ({} as any);
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (!original) return Promise.reject(error);

    const token = await getToken();
    // Demo tokens never refresh — silently bubble 401s
    if (token?.startsWith('demo.')) return Promise.reject(error);

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = await getRefreshToken();
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken: refresh });
        const accessToken = data?.data?.accessToken;
        if (!accessToken) throw new Error('No access token returned');
        await setToken(accessToken);
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(original);
      } catch {
        await logout();
      }
    }
    return Promise.reject(error);
  },
);

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
