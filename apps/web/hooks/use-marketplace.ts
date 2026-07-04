'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Listings ──
export function useMarketplaceListing(id?: string) {
  return useQuery({
    queryKey: ['marketplace', 'listings', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/listings/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useMyListings(params?: { category?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['marketplace', 'my-listings', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/listings/mine', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useMyVendor() {
  return useQuery({
    queryKey: ['marketplace', 'my-vendor'],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/vendors/mine');
      return data.data as any;
    },
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/marketplace/listings/${id}`, payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useDeactivateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/marketplace/listings/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

// ── Inquiries ──
export function useListingInquiries(listingId?: string) {
  return useQuery({
    queryKey: ['marketplace', 'inquiries', listingId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/listings/${listingId}/inquiries`);
      return data.data as any[];
    },
    enabled: !!listingId,
  });
}

export function useMyInquiries() {
  return useQuery({
    queryKey: ['marketplace', 'my-inquiries'],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/inquiries');
      return data.data as any[];
    },
  });
}

export function useCreateInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, ...body }: { listingId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/marketplace/listings/${listingId}/inquiries`, body);
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['marketplace', 'inquiries', vars.listingId] }),
  });
}

export function useRespondInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, response, status }: { id: string; response: string; status?: string }) => {
      const { data } = await apiClient.put(`/marketplace/inquiries/${id}`, { response, status });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

// ── Bookings ──
export function useListingBookings(listingId?: string) {
  return useQuery({
    queryKey: ['marketplace', 'bookings', listingId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/listings/${listingId}/bookings`);
      return data.data as any[];
    },
    enabled: !!listingId,
  });
}

export function useMyMarketplaceBookings() {
  // Traveler-side: bookings I placed
  return useQuery({
    queryKey: ['marketplace', 'my-bookings'],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/bookings/mine');
      return data.data as any[];
    },
  });
}

export function useVendorBookings() {
  // Provider-side: bookings my vendor received
  return useQuery({
    queryKey: ['marketplace', 'vendor-bookings'],
    queryFn: async () => {
      const { data } = await apiClient.get('/marketplace/bookings');
      return data.data as any[];
    },
  });
}

export function useCreateMarketplaceBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, ...body }: { listingId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/marketplace/listings/${listingId}/bookings`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}

export function useUpdateMarketplaceBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/marketplace/bookings/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace'] }),
  });
}
