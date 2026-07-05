'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ─── Pilgrims ────────────────────────────────────────────────────────────────

export function usePilgrims(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['pilgrims', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/pilgrims', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function usePilgrimStats() {
  return useQuery({
    queryKey: ['pilgrims', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/pilgrims/stats');
      return data.data as { byStatus: Record<string, number>; total: number };
    },
  });
}

export function useCreatePilgrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await apiClient.post('/pilgrims', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pilgrims'] }),
  });
}

export function useUpdatePilgrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/pilgrims/${id}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pilgrims'] }),
  });
}

export function useDeletePilgrim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/pilgrims/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pilgrims'] }),
  });
}

// ─── Hotels (create/update/delete) ───────────────────────────────────────────
export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => (await apiClient.post('/hotels', payload)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

// ─── Transport (vehicles / drivers / routes) ─────────────────────────────────
export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => (await apiClient.post('/transport/vehicles', payload)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}
export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => (await apiClient.post('/transport/drivers', payload)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}
export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => (await apiClient.post('/transport/routes', payload)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

// ─── Visa applications ──────────────────────────────────────────────────────
export function useCreateVisaApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => (await apiClient.post('/compliance/visas', payload)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export function useBookings(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/bookings', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function useBookingStats() {
  return useQuery({
    queryKey: ['bookings', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/bookings/stats');
      return data.data as { byStatus: Record<string, number>; total: number };
    },
  });
}

export function usePackages() {
  return useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const { data } = await apiClient.get('/packages');
      return data.data as any[];
    },
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await apiClient.post('/bookings', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

// ─── Hotels ──────────────────────────────────────────────────────────────────

export function useHotels(params?: { page?: number; limit?: number; search?: string; city?: string }) {
  return useQuery({
    queryKey: ['hotels', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/hotels', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function useHotelStats() {
  return useQuery({
    queryKey: ['hotels', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/hotels/stats');
      return data.data as any;
    },
  });
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export function useGroups(params?: { page?: number; limit?: number; search?: string; status?: string }) {
  return useQuery({
    queryKey: ['groups', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/groups', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function useGroupStats() {
  return useQuery({
    queryKey: ['groups', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/groups/stats');
      return data.data as { total: number; active: number; completed: number; incidents: number };
    },
  });
}

/** PUBLIC groups (cross-tenant) — what travelers browse + join. */
export function usePublicGroups(params?: { search?: string }) {
  return useQuery({
    queryKey: ['groups', 'public', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/groups/public', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data } = await apiClient.post(`/groups/${groupId}/join`, {});
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data } = await apiClient.post(`/groups/${groupId}/leave`, {});
      return data.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, any>) => {
      const { data } = await apiClient.post('/groups', dto);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      title: string;
      category: string;
      description?: string;
      vendorId: string;
      priceFrom?: number;
      currency?: string;
      city?: string;
    }) => {
      const { data } = await apiClient.post('/marketplace/listings', dto);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

// ─── Transport ───────────────────────────────────────────────────────────────

export function useTransportVehicles(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['transport', 'vehicles', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/vehicles', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useTransportDrivers(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['transport', 'drivers', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/drivers', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useTransportRoutes() {
  return useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/routes');
      return data.data as any[];
    },
  });
}

export function useTransportStats() {
  return useQuery({
    queryKey: ['transport', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/stats');
      return data.data as { vehicles: Record<string, any>; drivers: Record<string, any> };
    },
  });
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export function useCompliance(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['compliance', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/compliance/visas', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function useComplianceStats() {
  return useQuery({
    queryKey: ['compliance', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/compliance/visas/stats');
      return data.data as { byStatus: Record<string, number>; total: number; successRate: number };
    },
  });
}

// ─── Finance ─────────────────────────────────────────────────────────────────

export function useFinanceInvoices(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['finance', 'invoices', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/invoices', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useFinanceStats() {
  return useQuery({
    queryKey: ['finance', 'stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/stats');
      return data.data as {
        paid: { amountCents: number; count: number };
        outstanding: { amountCents: number; count: number };
        draft: { amountCents: number; count: number };
      };
    },
  });
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export function useMarketplaceListings(params?: { page?: number; limit?: number; category?: string; status?: string }) {
  return useQuery({
    queryKey: ['marketplace', 'listings', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/listings', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useMarketplaceVendors() {
  return useQuery({
    queryKey: ['marketplace', 'vendors'],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/vendors');
      return data.data as any[];
    },
  });
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function useReportsOverview() {
  return useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports/overview');
      return data.data as {
        totalPilgrims: number;
        activePilgrims: number;
        confirmedBookings: number;
        hotelCount: number;
        vehicleCount: number;
        revenuePaidCents: number;
        revenueOutstandingCents: number;
      };
    },
  });
}

export function useReportsPilgrims() {
  return useQuery({
    queryKey: ['reports', 'pilgrims'],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports/pilgrims');
      return data.data as { byStatus: Record<string, number>; byGender: { MALE: number; FEMALE: number } };
    },
  });
}

export function useReportsBookings() {
  return useQuery({
    queryKey: ['reports', 'bookings'],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports/bookings');
      return data.data as { byStatus: Record<string, number>; monthlyTrend: { month: string; count: number }[] };
    },
  });
}

export function useReportsFinance() {
  return useQuery({
    queryKey: ['reports', 'finance'],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports/finance');
      return data.data as {
        paid: { amountCents: number; count: number };
        outstanding: { amountCents: number; count: number };
        draft: { amountCents: number; count: number };
      };
    },
  });
}

export function useReportsVisa() {
  return useQuery({
    queryKey: ['reports', 'visa'],
    queryFn: async () => {
      const { data } = await apiClient.get('/reports/visa');
      return data.data as { byStatus: Record<string, number>; total: number; successRate: number };
    },
  });
}

// ─── Social ──────────────────────────────────────────────────────────────────

export function useSocialFeed(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['social', 'feed', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/feed', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useSocialAccount() {
  return useQuery({
    queryKey: ['social', 'account'],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/accounts/me');
      return data.data;
    },
  });
}
