'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ─── Single request (with offers) ───────────────────────────────────────────
export function useMarketplaceRequest(id?: string) {
  return useQuery({
    queryKey: ['marketplace-requests', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/marketplace/requests/${id}`);
      return data as any;
    },
    enabled: !!id,
  });
}

// ─── Traveler: accept / reject an offer ─────────────────────────────────────
export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) => {
      const { data } = await apiClient.post(
        `/marketplace/requests/${requestId}/offers/${offerId}/accept`,
      );
      return data as any;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['marketplace-requests', vars.requestId] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) => {
      const { data } = await apiClient.post(
        `/marketplace/requests/${requestId}/offers/${offerId}/reject`,
      );
      return data as any;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['marketplace-requests', vars.requestId] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

// ─── Traveler: convert an accepted offer into a booking / assignment ────────
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
    }) => {
      const { data } = await apiClient.post(
        `/marketplace/requests/${requestId}/offers/${offerId}/convert-to-booking`,
        payload,
      );
      return data as any;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['marketplace-requests', vars.requestId] });
      qc.invalidateQueries({ queryKey: ['requests'] });
      qc.invalidateQueries({ queryKey: ['transport'] });
      qc.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
}

// ─── Provider: create a new offer on a request ──────────────────────────────
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
    }) => {
      const { data } = await apiClient.post(
        `/marketplace/requests/${requestId}/offers`,
        dto,
      );
      return data as any;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['marketplace-requests', vars.requestId] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}

// ─── Traveler: close their request ──────────────────────────────────────────
export function useCloseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/marketplace/requests/${id}/close`);
      return data as any;
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['marketplace-requests', id] });
      qc.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
