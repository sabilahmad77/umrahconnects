'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Marketplace data access. Every money field on the wire is in minor units
 * (cents); forms convert with components/marketplace/listing-rules.ts.
 */

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ListingQuery {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  city?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  currency?: string;
  sort?: string;
  vendorId?: string;
}

/** Drops empty values so the API (which rejects unknown or malformed params) only sees real filters. */
function cleanParams<T extends object>(params?: T) {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v as string | number;
  }
  return out;
}

const invalidateMarketplace = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['marketplace'] });

// ── Listings: public catalogue ─────────────────────────────────────────────
export function useListingSearch(params: ListingQuery) {
  return useQuery({
    queryKey: ['marketplace', 'catalogue', cleanParams(params)],
    queryFn: async () => (await apiClient.get('/marketplace/listings', { params: cleanParams(params) })).data.data as Page<any>,
    placeholderData: (previous) => previous,
  });
}

/** A published listing as anyone may see it (404 for drafts and other statuses). */
export function useMarketplaceListing(id?: string, enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'listing', id],
    queryFn: async () => (await apiClient.get(`/marketplace/listings/${id}`)).data.data as any,
    enabled: !!id && enabled,
    retry: false,
  });
}

// ── Listings: the seller's own ─────────────────────────────────────────────
export function useMyListings(params: { page?: number; limit?: number; search?: string; status?: string; sort?: string }, enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'my-listings', cleanParams(params)],
    queryFn: async () => (await apiClient.get('/marketplace/listings/mine', { params: cleanParams(params) })).data.data as Page<any>,
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useCreateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, unknown>) => (await apiClient.post('/marketplace/listings', dto)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await apiClient.put(`/marketplace/listings/${id}`, payload)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

/** Soft delete (archive). */
export function useArchiveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/marketplace/listings/${id}`)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

/** @deprecated Kept for existing callers; the soft delete is an archive. */
export const useDeactivateListing = useArchiveListing;

// ── Seller profiles (vendors) ──────────────────────────────────────────────
/** The organization's primary seller profile, or null when it has not created one. */
export function useMyVendor(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'my-vendor'],
    queryFn: async () => (await apiClient.get('/marketplace/vendors/mine')).data.data as any | null,
    enabled,
    retry: false,
  });
}

export function useMarketplaceVendors() {
  return useQuery({
    queryKey: ['marketplace', 'vendors'],
    queryFn: async () => (await apiClient.get('/marketplace/vendors')).data.data as any[],
  });
}

/** Every seller profile of the caller's organization (empty until one is created). */
export function useMyVendors(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'my-vendors'],
    queryFn: async () => (await apiClient.get('/marketplace/vendors/mine/all')).data.data as any[],
    enabled,
    retry: false,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, unknown>) => (await apiClient.post('/marketplace/vendors', dto)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...dto }: { id: string } & Record<string, unknown>) =>
      (await apiClient.put(`/marketplace/vendors/${id}`, dto)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

// ── Media ──────────────────────────────────────────────────────────────────
export interface UploadedMedia {
  id: string;
  url: string;
  size: number;
  mime: string;
  name: string | null;
}

/** Uploads one public image; `onProgress` receives 0–100. */
export async function uploadImage(file: File, onProgress?: (percent: number) => void, signal?: AbortSignal) {
  const body = new FormData();
  body.append('file', file);
  const { data } = await apiClient.post('/uploads', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
    signal,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    },
  });
  return data.data as UploadedMedia;
}

/** Deletes an image the caller uploaded (refused with 409 while something still shows it). */
export async function deleteUploadedImage(id: string) {
  return (await apiClient.delete(`/uploads/${id}`)).data.data as { id: string; deleted: true };
}

// ── Inquiries ──────────────────────────────────────────────────────────────
export function useListingInquiries(listingId?: string, enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'inquiries', listingId],
    queryFn: async () => (await apiClient.get(`/marketplace/listings/${listingId}/inquiries`)).data.data as any[],
    enabled: !!listingId && enabled,
  });
}

/** Inquiries on every listing of my organization. */
export function useMyInquiries(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'my-inquiries'],
    queryFn: async () => (await apiClient.get('/marketplace/inquiries')).data.data as any[],
    enabled,
  });
}

export function useCreateInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, ...body }: { listingId: string } & Record<string, unknown>) =>
      (await apiClient.post(`/marketplace/listings/${listingId}/inquiries`, body)).data.data,
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['marketplace', 'inquiries', vars.listingId] }),
  });
}

export function useRespondInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, response, status }: { id: string; response: string; status?: string }) =>
      (await apiClient.put(`/marketplace/inquiries/${id}`, { response, status })).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

// ── Bookings ───────────────────────────────────────────────────────────────
export function useListingBookings(listingId?: string, enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'bookings', listingId],
    queryFn: async () => (await apiClient.get(`/marketplace/listings/${listingId}/bookings`)).data.data as any[],
    enabled: !!listingId && enabled,
  });
}

/** Traveler side: bookings I placed. */
export function useMyMarketplaceBookings() {
  return useQuery({
    queryKey: ['marketplace', 'my-bookings'],
    queryFn: async () => (await apiClient.get('/marketplace/bookings/mine')).data.data as any[],
  });
}

/** Provider side: bookings on every listing of my organization. */
export function useVendorBookings(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'vendor-bookings'],
    queryFn: async () => (await apiClient.get('/marketplace/bookings')).data.data as any[],
    enabled,
  });
}

export function useCreateMarketplaceBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listingId, ...body }: { listingId: string } & Record<string, unknown>) =>
      (await apiClient.post(`/marketplace/listings/${listingId}/bookings`, body)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

export function useUpdateMarketplaceBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      (await apiClient.put(`/marketplace/bookings/${id}`, body)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

/** Traveler cancels their own pending, unpaid booking (the server re-checks every condition). */
export function useCancelMarketplaceBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/marketplace/bookings/${id}/cancel`)).data.data,
    onSuccess: () => invalidateMarketplace(qc),
  });
}

// ── Quotes ─────────────────────────────────────────────────────────────────
export function useRequestQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, unknown>) => (await apiClient.post('/marketplace/quotes', dto)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace', 'quotes'] }),
  });
}

/** Quotes my organization asked for. */
export function useMyQuotes(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'quotes', 'mine'],
    queryFn: async () => (await apiClient.get('/marketplace/quotes')).data.data as any[],
    enabled,
  });
}

/** Quotes other organizations asked my seller profiles for. */
export function useIncomingQuotes(enabled = true) {
  return useQuery({
    queryKey: ['marketplace', 'quotes', 'incoming'],
    queryFn: async () => (await apiClient.get('/marketplace/quotes/incoming')).data.data as any[],
    enabled,
  });
}

export function useRespondQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...dto }: { id: string; offeredPriceCents: number; validUntil?: string; notes?: string }) =>
      (await apiClient.put(`/marketplace/quotes/${id}`, dto)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace', 'quotes'] }),
  });
}

export function useDecideQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'accept' | 'reject' }) =>
      (await apiClient.put(`/marketplace/quotes/${id}/${decision}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marketplace', 'quotes'] }),
  });
}
