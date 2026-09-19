'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Marketplace service requests (traveler asks, providers offer). Every route
 * answers with the `{ success, data }` envelope; `unwrap` also accepts a bare
 * payload so an older API build keeps working during a rollout.
 */
export function unwrap<T = any>(body: any): T {
  return body && typeof body === 'object' && body.success === true && 'data' in body ? body.data : body;
}

const invalidateRequests = (qc: ReturnType<typeof useQueryClient>, id?: string) => {
  qc.invalidateQueries({ queryKey: ['requests'] });
  if (id) qc.invalidateQueries({ queryKey: ['marketplace-requests', id] });
};

// ─── Lists ──────────────────────────────────────────────────────────────────
/** Requests the signed-in user created (with the offers they received). */
export function useMyServiceRequests(params: { status?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['requests', 'mine', params],
    queryFn: async () => unwrap<{ items: any[]; total: number }>((await apiClient.get('/marketplace/requests/mine', { params })).data),
  });
}

/** Provider: open requests of other organizations. */
export function useOpenServiceRequests(params: { serviceType?: string; page?: number } = {}, enabled = true) {
  return useQuery({
    queryKey: ['requests', 'open', params],
    queryFn: async () => unwrap<{ items: any[]; total: number }>((await apiClient.get('/marketplace/requests/open', { params })).data),
    enabled,
  });
}

/** Provider: offers I sent, with their request. */
export function useMySentOffers(params: { status?: string; page?: number } = {}, enabled = true) {
  return useQuery({
    queryKey: ['requests', 'offers-mine', params],
    queryFn: async () => unwrap<{ items: any[]; total: number }>((await apiClient.get('/marketplace/requests/offers/mine', { params })).data),
    enabled,
  });
}

// ─── Single request (with offers) ───────────────────────────────────────────
export function useMarketplaceRequest(id?: string) {
  return useQuery({
    queryKey: ['marketplace-requests', id],
    queryFn: async () => unwrap((await apiClient.get(`/marketplace/requests/${id}`)).data),
    enabled: !!id,
    retry: false,
  });
}

// ─── Traveler: create, close, accept / reject, convert ─────────────────────
export function useCreateServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, unknown>) => unwrap((await apiClient.post('/marketplace/requests', dto)).data),
    onSuccess: () => invalidateRequests(qc),
  });
}

export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/accept`)).data),
    onSuccess: (_d, vars) => invalidateRequests(qc, vars.requestId),
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/reject`)).data),
    onSuccess: (_d, vars) => invalidateRequests(qc, vars.requestId),
  });
}

/**
 * Turns an accepted offer into a booking. The requester converts hotel, package,
 * visa and other offers; for transport the offering provider converts, because
 * only it can pick one of its vehicles.
 */
export function useConvertOfferToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      offerId,
      ...payload
    }: {
      requestId: string;
      offerId: string;
      vehicleId?: string;
      routeId?: string;
      scheduledAt?: string;
      passengerCount?: number;
      notes?: string;
      listingId?: string;
    }) => unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/convert-to-booking`, payload)).data),
    onSuccess: (_d, vars) => {
      invalidateRequests(qc, vars.requestId);
      qc.invalidateQueries({ queryKey: ['transport'] });
      qc.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

export function useCloseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap((await apiClient.post(`/marketplace/requests/${id}/close`)).data),
    onSuccess: (_d, id) => invalidateRequests(qc, id),
  });
}

// ─── Provider: send an offer ────────────────────────────────────────────────
export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      ...dto
    }: {
      requestId: string;
      title: string;
      description?: string;
      priceCents: number;
      currency?: string;
      validUntil?: string;
      vendorId?: string;
    }) => unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers`, dto)).data),
    onSuccess: (_d, vars) => invalidateRequests(qc, vars.requestId),
  });
}
