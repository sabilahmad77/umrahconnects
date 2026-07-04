import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import {
  DashboardType, inferDashboardType, setRefreshToken, StoredUser,
} from '@/lib/auth';
import { useAuthStore } from '@/lib/auth-store';

// ─── JWT decoder (no external dep) ───────────────────────────────────────────
function b64UrlDecode(input: string): string {
  const pad = input + '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = pad.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob !== 'undefined') return atob(b64);
  // @ts-ignore — Buffer is sometimes available in dev
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf-8');
  throw new Error('No base64 decoder');
}
function decodeJwt(token: string): any | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(b64UrlDecode(payload));
  } catch { return null; }
}

// ─── Demo users (mirror apps/web) ────────────────────────────────────────────
const DEMO_USERS: Record<DashboardType, StoredUser> = {
  operator: {
    id: 'demo-operator', email: 'admin@alharamain.sa',
    tenantId: 'demo-tenant', tenantName: 'Al Haramain Tours', tenantSlug: 'al-haramain-ksa',
    tenantType: 'OPERATOR', roles: ['OPERATOR_ADMIN'], dashboardType: 'operator',
    displayName: 'Ahmad Operator',
  },
  hotel: {
    id: 'demo-hotel', email: 'hotel@alharamain.sa',
    tenantId: 'demo-tenant', tenantName: 'Al Haramain Tours', tenantSlug: 'al-haramain-ksa',
    tenantType: 'HOTEL', roles: ['HOTEL_OWNER'], dashboardType: 'hotel',
    displayName: 'Fatima Hotel Mgr',
  },
  transport: {
    id: 'demo-transport', email: 'transport@alharamain.sa',
    tenantId: 'demo-tenant', tenantName: 'Al Haramain Tours', tenantSlug: 'al-haramain-ksa',
    tenantType: 'TRANSPORT', roles: ['TRANSPORT_MANAGER'], dashboardType: 'transport',
    displayName: 'Omar Transport Mgr',
  },
  compliance: {
    id: 'demo-compliance', email: 'visa@alharamain.sa',
    tenantId: 'demo-tenant', tenantName: 'Al Haramain Tours', tenantSlug: 'al-haramain-ksa',
    tenantType: 'COMPLIANCE', roles: ['COMPLIANCE_OFFICER'], dashboardType: 'compliance',
    displayName: 'Sara Visa Officer',
  },
  finance: {
    id: 'demo-finance', email: 'finance@alharamain.sa',
    tenantId: 'demo-tenant', tenantName: 'Al Haramain Tours', tenantSlug: 'al-haramain-ksa',
    tenantType: 'FINANCE', roles: ['FINANCE_MANAGER'], dashboardType: 'finance',
    displayName: 'Khalid Finance Mgr',
  },
  admin: {
    id: 'demo-admin', email: 'superadmin@umrahconnects.io',
    tenantId: 'demo-tenant', tenantName: 'Umrah Connects HQ', tenantSlug: 'al-haramain-ksa',
    tenantType: 'OPERATOR', roles: ['SUPER_ADMIN'], dashboardType: 'admin',
    displayName: 'Super Admin',
  },
  pilgrim: {
    id: 'demo-pilgrim', email: 'pilgrim@example.com',
    tenantId: 'demo-tenant', tenantName: 'Pilgrim Community', tenantSlug: 'al-haramain-ksa',
    tenantType: 'PILGRIM', roles: ['PILGRIM'], dashboardType: 'pilgrim',
    displayName: 'Nur Pilgrim',
  },
};

// Build a base64 string from a JSON-string. RN Hermes ships atob/btoa.
function fakeJwtFor(user: StoredUser): string {
  const payload = JSON.stringify({
    sub: user.id, exp: Math.floor(Date.now() / 1000) + 86400, roles: user.roles ?? [],
  });
  const b64 = typeof btoa !== 'undefined' ? btoa(payload) : (
    // @ts-ignore
    typeof Buffer !== 'undefined' ? Buffer.from(payload, 'utf-8').toString('base64') : payload
  );
  return `demo.${b64}.sig`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export function useTenantBySlug(slug?: string) {
  return useQuery({
    queryKey: ['tenant', 'slug', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data } = await apiClient.get(`/tenants/slug/${slug}`);
      return data.data ?? data;
    },
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      tenantSlug: string; email: string; password: string;
      preferredDashboard?: DashboardType;
    }): Promise<StoredUser> => {
      const tenantRes = await apiClient.get(`/tenants/slug/${vars.tenantSlug}`);
      const t = tenantRes.data?.data ?? tenantRes.data;
      const tenantId = t?.id;
      if (!tenantId) throw new Error('Workspace not found');

      const loginRes = await apiClient.post('/auth/login', {
        tenantId, email: vars.email, password: vars.password,
      });
      const payload = loginRes.data?.data ?? loginRes.data;
      const { accessToken, refreshToken } = payload;
      if (!accessToken) throw new Error('No access token returned');

      const claims = decodeJwt(accessToken) ?? {};
      const roles: string[] = claims.roles ?? [];
      const dashboardType = vars.preferredDashboard ?? inferDashboardType(roles);
      const user: StoredUser = {
        id: claims.sub ?? '',
        email: vars.email,
        tenantId,
        tenantName: t?.name,
        tenantSlug: t?.slug ?? vars.tenantSlug,
        tenantType: claims.tenantType ?? 'OPERATOR',
        roles,
        dashboardType,
        displayName: vars.email.split('@')[0],
      };

      if (refreshToken) await setRefreshToken(refreshToken);
      await useAuthStore.getState().setSession(accessToken, user);
      return user;
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

/**
 * Demo login — logs in as the seeded admin against the real backend, but
 * overrides the visible persona to the role the user picked. This way every
 * API call works (real JWT) while the UI still looks role-specific.
 */
export function useLoginAsDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dt: DashboardType): Promise<StoredUser> => {
      const persona = DEMO_USERS[dt];

      // 1) Real API login as seeded admin
      const tenantSlug = 'al-haramain-ksa';
      const tenantRes = await apiClient.get(`/tenants/slug/${tenantSlug}`);
      const t = tenantRes.data?.data ?? tenantRes.data;
      const tenantId = t?.id;
      if (!tenantId) throw new Error('Demo workspace not found');

      const loginRes = await apiClient.post('/auth/login', {
        tenantId,
        email: 'admin@alharamain.sa',
        password: 'Admin@1234',
      });
      const payload = loginRes.data?.data ?? loginRes.data;
      const { accessToken, refreshToken } = payload;
      if (!accessToken) throw new Error('Demo login failed');

      if (refreshToken) await setRefreshToken(refreshToken);

      // 2) Build the visible user with the persona but real tenant/id
      const claims = decodeJwt(accessToken) ?? {};
      const user: StoredUser = {
        ...persona,
        id: claims.sub ?? persona.id,
        tenantId,
        tenantSlug: t?.slug ?? tenantSlug,
        tenantName: t?.name ?? persona.tenantName,
        tenantType: claims.tenantType ?? persona.tenantType,
        dashboardType: dt,
        displayName: persona.displayName,
        email: persona.email,
        roles: persona.roles,
      };

      // 3) Persist real session — Zustand store + AsyncStorage
      await useAuthStore.getState().setSession(accessToken, user);
      return user;
    },
    onSuccess: () => { qc.invalidateQueries(); },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await useAuthStore.getState().signOut();
      qc.clear();
    },
  });
}

// Alias for backward compatibility
export const useLogout = useSignOut;

// ─────────────────────────────────────────────────────────────────────────────
// Pilgrims
// ─────────────────────────────────────────────────────────────────────────────
export function usePilgrims(params: any = {}) {
  return useQuery({
    queryKey: ['pilgrims', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/pilgrims', { params });
      return data.data ?? data;
    },
  });
}
export function usePilgrimStats() {
  return useQuery({
    queryKey: ['pilgrims', 'stats'],
    queryFn: async () => (await apiClient.get('/pilgrims/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookings
// ─────────────────────────────────────────────────────────────────────────────
export function useBookings(params: any = {}) {
  return useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => (await apiClient.get('/bookings', { params })).data?.data,
  });
}
export function useBookingStats() {
  return useQuery({
    queryKey: ['bookings', 'stats'],
    queryFn: async () => (await apiClient.get('/bookings/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotels
// ─────────────────────────────────────────────────────────────────────────────
export function useHotels(params: any = {}) {
  return useQuery({
    queryKey: ['hotels', params],
    queryFn: async () => (await apiClient.get('/hotels', { params })).data?.data,
  });
}
export function useHotelStats() {
  return useQuery({
    queryKey: ['hotels', 'stats'],
    queryFn: async () => (await apiClient.get('/hotels/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport
// ─────────────────────────────────────────────────────────────────────────────
export function useTransportVehicles() {
  return useQuery({
    queryKey: ['transport', 'vehicles'],
    queryFn: async () => (await apiClient.get('/transport/vehicles')).data?.data,
  });
}
export function useTransportDrivers() {
  return useQuery({
    queryKey: ['transport', 'drivers'],
    queryFn: async () => (await apiClient.get('/transport/drivers')).data?.data,
  });
}
export function useTransportRoutes() {
  return useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: async () => (await apiClient.get('/transport/routes')).data?.data,
  });
}
export function useTransportStats() {
  return useQuery({
    queryKey: ['transport', 'stats'],
    queryFn: async () => (await apiClient.get('/transport/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance / Visa
// ─────────────────────────────────────────────────────────────────────────────
export function useVisas(params: any = {}) {
  return useQuery({
    queryKey: ['compliance', 'visas', params],
    queryFn: async () => (await apiClient.get('/compliance/visas', { params })).data?.data,
  });
}
export function useVisaStats() {
  return useQuery({
    queryKey: ['compliance', 'visas', 'stats'],
    queryFn: async () => (await apiClient.get('/compliance/visas/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance
// ─────────────────────────────────────────────────────────────────────────────
export function useFinanceInvoices(params: any = {}) {
  return useQuery({
    queryKey: ['finance', 'invoices', params],
    queryFn: async () => (await apiClient.get('/finance/invoices', { params })).data?.data,
  });
}
export function useFinanceStats() {
  return useQuery({
    queryKey: ['finance', 'stats'],
    queryFn: async () => (await apiClient.get('/finance/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups
// ─────────────────────────────────────────────────────────────────────────────
export function useGroups(params: any = {}) {
  return useQuery({
    queryKey: ['groups', params],
    queryFn: async () => (await apiClient.get('/groups', { params })).data?.data,
  });
}
export function useGroupStats() {
  return useQuery({
    queryKey: ['groups', 'stats'],
    queryFn: async () => (await apiClient.get('/groups/stats')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace
// ─────────────────────────────────────────────────────────────────────────────
export function useMarketplaceListings(params: any = {}) {
  return useQuery({
    queryKey: ['marketplace', 'listings', params],
    queryFn: async () => (await apiClient.get('/marketplace/listings', { params })).data?.data,
  });
}
export function useMarketplaceVendors() {
  return useQuery({
    queryKey: ['marketplace', 'vendors'],
    queryFn: async () => (await apiClient.get('/marketplace/vendors')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Social
// ─────────────────────────────────────────────────────────────────────────────
export function useSocialFeed(params: any = { page: 1, limit: 20 }) {
  return useQuery({
    queryKey: ['social', 'feed', params],
    queryFn: async () => (await apiClient.get('/social/feed', { params })).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Social — full set of mutations + queries
// ─────────────────────────────────────────────────────────────────────────────
export function useSocialPost(id?: string) {
  return useQuery({
    queryKey: ['social', 'post', id],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`/social/posts/${id}`)).data?.data,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { content: string; visibility?: string; type?: string }) =>
      // Backend PostType enum default is 'UPDATE'; don't pass invalid 'TEXT'
      (await apiClient.post('/social/posts', { visibility: 'PUBLIC', type: 'UPDATE', ...vars })).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social'] }); },
  });
}

export function useReactToPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { postId: string; type?: 'LIKE' | 'LOVE' | 'SHARE' }) =>
      (await apiClient.post(`/social/posts/${vars.postId}/react`, { type: vars.type ?? 'LIKE' })).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social'] }); },
  });
}

export function usePostComments(postId?: string) {
  return useQuery({
    queryKey: ['social', 'post', postId, 'comments'],
    enabled: !!postId,
    queryFn: async () => {
      // Backend doesn't have a dedicated /comments endpoint — the post detail returns
      // comments inline. Fetch the post and shape the response like a list.
      const res = await apiClient.get(`/social/posts/${postId}`);
      const post = res.data?.data ?? res.data;
      return { items: post?.comments ?? [] };
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { postId: string; body: string }) =>
      (await apiClient.post(`/social/posts/${vars.postId}/comments`, { body: vars.body, content: vars.body })).data?.data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['social', 'post', vars.postId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { postId: string }) =>
      (await apiClient.post(`/social/posts/${vars.postId}/save`)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social'] }); },
  });
}

export function useDiscoverPeople() {
  return useQuery({
    queryKey: ['social', 'discover', 'people'],
    queryFn: async () => (await apiClient.get('/social/discover/people')).data?.data,
  });
}

export function useDiscoverTrending() {
  return useQuery({
    queryKey: ['social', 'discover', 'trending'],
    queryFn: async () => (await apiClient.get('/social/discover/trending')).data?.data,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Messaging (DMs)
// ─────────────────────────────────────────────────────────────────────────────
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await apiClient.get('/social/conversations')).data?.data,
    refetchInterval: 15_000, // light polling for new messages
  });
}

export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['conversations', conversationId, 'messages'],
    enabled: !!conversationId,
    queryFn: async () => (await apiClient.get(`/social/conversations/${conversationId}/messages`)).data?.data,
    refetchInterval: 8_000,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { conversationId: string; body: string }) =>
      (await apiClient.post(`/social/conversations/${vars.conversationId}/messages`, { body: vars.body })).data?.data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['conversations', vars.conversationId, 'messages'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipientUserId: string) =>
      (await apiClient.post('/social/conversations/open', { recipientUserId })).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversations'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Connections
// ─────────────────────────────────────────────────────────────────────────────
export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await apiClient.get('/connections')).data?.data,
  });
}

export function usePendingConnections() {
  return useQuery({
    queryKey: ['connections', 'pending'],
    queryFn: async () => (await apiClient.get('/connections/pending')).data?.data,
  });
}

export function useRequestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { targetUserId: string; message?: string }) =>
      (await apiClient.post('/connections/request', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['connections'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await apiClient.get('/notifications', { params: { limit: 50 } })).data?.data,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post('/notifications/read-all', {})).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotels — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/hotels', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotels'] }); },
  });
}

export function useUpdateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; data: any }) =>
      (await apiClient.put(`/hotels/${vars.id}`, vars.data)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hotels'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/transport/vehicles', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport'] }); },
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/transport/drivers', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport'] }); },
  });
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/transport/routes', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transport'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace — full
// ─────────────────────────────────────────────────────────────────────────────
export function useOpenRequests() {
  return useQuery({
    queryKey: ['marketplace', 'open'],
    queryFn: async () => (await apiClient.get('/marketplace/requests/open', { params: { limit: 50 } })).data?.data,
  });
}

export function useMyRequests() {
  return useQuery({
    queryKey: ['marketplace', 'mine'],
    queryFn: async () => (await apiClient.get('/marketplace/requests/mine', { params: { limit: 50 } })).data?.data,
  });
}

export function useMyOffers() {
  return useQuery({
    queryKey: ['marketplace', 'my-offers'],
    queryFn: async () => (await apiClient.get('/marketplace/requests/offers/mine', { params: { limit: 50 } })).data?.data,
  });
}

export function useRequestDetail(id?: string) {
  return useQuery({
    queryKey: ['marketplace', 'request', id],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`/marketplace/requests/${id}`)).data?.data,
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) =>
      (await apiClient.post('/marketplace/requests', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketplace'] }); },
  });
}

export function useSubmitOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { requestId: string; data: any }) =>
      (await apiClient.post(`/marketplace/requests/${vars.requestId}/offers`, vars.data)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketplace'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pilgrims — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreatePilgrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/pilgrims', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pilgrims'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Groups — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/groups', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bookings — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/bookings', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bookings'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/finance/invoices', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); },
  });
}

export function useCreateBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/finance/budget-plans', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Visa — mutations
// ─────────────────────────────────────────────────────────────────────────────
export function useCreateVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: any) => (await apiClient.post('/compliance/visas', vars)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['compliance'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin queries (Super Admin)
// ─────────────────────────────────────────────────────────────────────────────
export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await apiClient.get('/admin/stats')).data?.data,
  });
}

export function useAdminTenants() {
  return useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => (await apiClient.get('/admin/tenants', { params: { limit: 50 } })).data?.data,
  });
}

export function useAdminKyc() {
  return useQuery({
    queryKey: ['admin', 'kyc'],
    queryFn: async () => (await apiClient.get('/admin/kyc', { params: { limit: 50 } })).data?.data,
  });
}

export function useApproveKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.put(`/admin/kyc/${id}/approve`)).data?.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin'] }); },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────────────────────────────────────
export function useReportsOverview() {
  return useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: async () => (await apiClient.get('/reports/overview')).data?.data,
  });
}
export function useReportsPilgrims() {
  return useQuery({
    queryKey: ['reports', 'pilgrims'],
    queryFn: async () => (await apiClient.get('/reports/pilgrims')).data?.data,
  });
}
export function useReportsBookings() {
  return useQuery({
    queryKey: ['reports', 'bookings'],
    queryFn: async () => (await apiClient.get('/reports/bookings')).data?.data,
  });
}
export function useReportsFinance() {
  return useQuery({
    queryKey: ['reports', 'finance'],
    queryFn: async () => (await apiClient.get('/reports/finance')).data?.data,
  });
}
export function useReportsVisa() {
  return useQuery({
    queryKey: ['reports', 'visa'],
    queryFn: async () => (await apiClient.get('/reports/visa')).data?.data,
  });
}
