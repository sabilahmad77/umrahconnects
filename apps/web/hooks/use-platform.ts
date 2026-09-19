'use client';

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { unwrap } from '@/hooks/use-marketplace-requests';

// ─── Notifications ───────────────────────────────────────────────────────
export function useNotifications(params: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications', { params });
      // The controller wraps the payload as { success, data }. Returning the
      // envelope left `items` undefined, so the bell always showed "No
      // notifications yet" and an unread count of zero.
      return data.data as { items: any[]; total: number; unread: number; page: number; limit: number };
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

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** The full notification list as pages ("Load more"), optionally unread only. */
export function useNotificationPages(unreadOnly = false, limit = 20) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'pages', { unreadOnly, limit }],
    queryFn: async ({ pageParam }) =>
      (await apiClient.get('/notifications', { params: { page: pageParam, limit, ...(unreadOnly ? { unreadOnly: true } : {}) } })).data
        .data as { items: AppNotification[]; total: number; unread: number; page: number; limit: number },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    refetchInterval: 30_000,
  });
}

/**
 * Only in-app paths are followed from a notification: anything else (an absolute
 * URL, a protocol-relative `//host`, a `javascript:` link) is ignored.
 */
export function safeNotificationLink(link?: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;
  return link;
}

// ─── Connections (standard { success, data } envelope) ───────────────────
export interface ConnectionParty {
  connectionId: string;
  displayName?: string;
  /** Present only when the other person's contact visibility allows it. */
  email?: string;
  avatarUrl?: string;
  bio?: string;
  verified?: boolean;
}
const refreshNetwork = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['connections'] });
  // Discover and the suggestions panel show each person's connection status.
  qc.invalidateQueries({ queryKey: ['social', 'discover'] });
};
export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: async () =>
      (await apiClient.get('/connections')).data.data as { items: (ConnectionParty & { otherUserId: string; since: string })[]; total: number },
  });
}
export function usePendingConnections() {
  return useQuery({
    queryKey: ['connections', 'pending'],
    queryFn: async () =>
      (await apiClient.get('/connections/pending')).data.data as {
        items: (ConnectionParty & { requesterId: string; createdAt: string; message?: string })[];
        total: number;
      },
  });
}
export function useOutgoingConnections() {
  return useQuery({
    queryKey: ['connections', 'outgoing'],
    queryFn: async () =>
      (await apiClient.get('/connections/outgoing')).data.data as {
        items: (ConnectionParty & { recipientId: string; createdAt: string; message?: string })[];
        total: number;
      },
  });
}
export function useConnectionStatus(otherUserId?: string) {
  return useQuery({
    queryKey: ['connections', 'status', otherUserId],
    enabled: !!otherUserId,
    queryFn: async () => (await apiClient.get(`/connections/status/${otherUserId}`)).data.data,
  });
}
export function useRequestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ recipientId, message }: { recipientId: string; message?: string }) =>
      (await apiClient.post('/connections/request', { recipientId, ...(message ? { message } : {}) })).data.data,
    onSuccess: () => refreshNetwork(qc),
  });
}
export function useAcceptConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/connections/${id}/accept`)).data.data,
    onSuccess: () => refreshNetwork(qc),
  });
}
export function useRejectConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/connections/${id}/reject`)).data.data,
    onSuccess: () => refreshNetwork(qc),
  });
}
/** Removes a connection, or withdraws a request you sent, with that user. */
export function useRemoveConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => (await apiClient.delete(`/connections/with/${otherUserId}`)).data.data as { removed: boolean },
    onSuccess: () => refreshNetwork(qc),
  });
}

// ─── Marketplace Requests (traveler-side + provider-side) ────────────────
// The API wraps these in { success, data } (P08); `unwrap` returns the payload.
// hooks/use-marketplace-requests.ts holds the full set used by the request screens.
export function useMyRequests(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'mine', params],
    queryFn: async () => unwrap((await apiClient.get('/marketplace/requests/mine', { params })).data),
  });
}
export function useOpenRequests(params: { serviceType?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'open', params],
    queryFn: async () => unwrap((await apiClient.get('/marketplace/requests/open', { params })).data),
  });
}
export function useMyOffers(params: { status?: string } = {}) {
  return useQuery({
    queryKey: ['requests', 'offers-mine', params],
    queryFn: async () => unwrap((await apiClient.get('/marketplace/requests/offers/mine', { params })).data),
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
    }) => unwrap((await apiClient.post('/marketplace/requests', dto)).data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useSendOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, ...dto }: { requestId: string; title: string; description?: string; priceCents: number; currency?: string; validUntil?: string }) =>
      unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers`, dto)).data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useAcceptOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/accept`)).data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}
export function useRejectOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, offerId }: { requestId: string; offerId: string }) =>
      unwrap((await apiClient.post(`/marketplace/requests/${requestId}/offers/${offerId}/reject`)).data),
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
/**
 * A conversation's messages, newest page first ("Load earlier messages" fetches
 * older pages). Reading also settles the conversation's message notifications
 * on the server, so the bell is refreshed after each load.
 */
export function useMessages(conversationId?: string) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async ({ pageParam }) => {
      const data = (await apiClient.get(`/social/conversations/${conversationId}/messages`, { params: { page: pageParam, limit: 30 } })).data
        .data as { items: any[]; total: number; page: number; limit: number; totalPages: number };
      qc.invalidateQueries({ queryKey: ['notifications'] });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
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
