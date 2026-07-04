import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredUser, getToken, StoredUser, DashboardType } from './auth';

type AuthState = {
  user: StoredUser | null;
  token: string | null;
  isReady: boolean;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: StoredUser) => Promise<void>;
  setActiveDashboard: (dt: DashboardType) => Promise<void>;
  signOut: () => Promise<void>;
};

const KEY_TOKEN = 'umrah.accessToken';
const KEY_REFRESH = 'umrah.refreshToken';
const KEY_USER = 'umrah.currentUser';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isReady: false,

  hydrate: async () => {
    const [token, user] = await Promise.all([getToken(), getStoredUser()]);
    set({ token, user, isReady: true });
  },

  setSession: async (token, user) => {
    await AsyncStorage.setItem(KEY_TOKEN, token);
    await AsyncStorage.setItem(KEY_USER, JSON.stringify(user));
    set({ token, user });
  },

  setActiveDashboard: async (dt) => {
    const user = get().user;
    if (!user) return;
    const next: StoredUser = { ...user, dashboardType: dt };
    await AsyncStorage.setItem(KEY_USER, JSON.stringify(next));
    set({ user: next });
  },

  signOut: async () => {
    try { await AsyncStorage.multiRemove([KEY_TOKEN, KEY_REFRESH, KEY_USER]); } catch {}
    set({ token: null, user: null });
  },
}));
