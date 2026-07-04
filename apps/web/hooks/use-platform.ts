'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ─── Notifications ───────────────────────────────────────────────────────
export function useNotifications(params: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications', { params });
      return data as { items: any[]; total: number; unread: number; page: number; limit: number };
    },
    refetchInterval: 30_000, // poll every 30s
  });
}
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => (await apiClient.patch('/notifications/read', { ids })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await apiClient.post('/notifications/read-all')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ─── Connections ─────────────────────────────────────────────────────────
export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async () => (await apiClient.get('/connections')).data as { items: any[]; total: number },
  });
}
export function usePendingConnections() {
  return useQuery({
    queryKey: ['connections', 'pending'],
    queryFn: async () => (await apiClient.get('/connections/pending')).data as { items: any[]; total: number },
  });
}
export function useConnectionStatus(otherUserId?: string) {
  return useQuery({
    queryKey: ['connections', 'status', otherUserId],
    enabled: !!otherUserId,
    queryFn: async () => (await apiClient.get(`/connections/status/${otherUserId}`)).data,
  });
}
export function useRequestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipientId, message }: { recipientId: string; message?: string }) =>
      (await apiClient.post('/connections/request', { recipientId, message })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export function useAcceptConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/connections/${id}/accept`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}
export function useRejectConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/connections/${id}/reject`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

// ─── Marketplace Requests (traveler-side + provider-side) ────────────────
export function useMyRequests(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'mine', params],
    queryFn: async () => (await apiClient.get('/marketplace/requests/mine', { params })).data,
  });
}
export function useOpenRequests(params: { serviceType?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'open', params],
    queryFn: async () => (await apiClient.get('/marketplace/requests/open', { params })).data,
  });
}
export function useMyOffers(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'offers-mine', params],
    queryFn: async () => (await apiClient.get('/marketplace/requests/offers/mine', { params })).data,
  });
}
export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      serviceType: string;
      title: string;
      description?: string;
      city?: string;
      dateFrom?: string;
      dateTo?: string;
      travelers?: number;
      budgetMinCents?: number;
      budgetMaxCents?: number;
      currency?: string;
    }) => (await apiClient.post('/marketplace/requests', dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useSendOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, ...dto }: { requestId: string; title: string; description?: string; priceCents: number; currency?: string; validUntil?: string }) =>
      (await apiClient.post(`/marketplace/requests/${requestId}/offers`, dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      (await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/accept`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      (await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/reject`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

// ─── Profile editing (social account) ───────────────────────────────────
export function useMyProfile() {
  return useQuery({
    queryKey: ['social', 'account', 'me'],
    queryFn: async () => (await apiClient.get('/social/accounts/me')).data?.data,
  });
}
export function useUpdateMyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { displayName?: string; bio?: string; avatarUrl?: string; coverUrl?: string }) =>
      (await apiClient.put('/social/accounts/me', dto)).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'account'] }),
  });
}

// ─── Messaging ───────────────────────────────────────────────────────────
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await apiClient.get('/social/conversations')).data?.data as { items: any[]; total: number },
  });
}
export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipientUserId: string) =>
      (await apiClient.post('/social/conversations/open', { recipientUserId })).data?.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}
export function useMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async () => (await apiClient.get(`/social/conversations/${conversationId}/messages`)).data?.data,
    refetchInterval: 15_000,
  });
}
export function useSendMessage(conversationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      (await apiClient.post(`/social/conversations/${conversationId}/messages`, { body })).data?.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
