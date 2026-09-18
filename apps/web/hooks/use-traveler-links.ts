'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Traveler ↔ pilgrim links (P06, DECISIONS.md D-022).
 *
 * Organization side: /pilgrims/:id/account-links (crm:pilgrim:read / update).
 * Traveler side: /travelers/me/* — the caller's own links and status-only trips.
 * The invitation token is only ever sent in a request body.
 */

export type AccountLinkStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REVOKED' | 'UNLINKED' | 'EXPIRED';

export interface OrganizationAccountLink {
  id: string;
  status: AccountLinkStatus;
  invitedEmail: string;
  emailSource: 'RECORD' | 'ENTERED' | string;
  invitedAt: string;
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  invitedBy: { id: string; name: string } | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  unlinkedAt: string | null;
  revokedAt: string | null;
  revokedBy: { id: string; name: string } | null;
  revokedReason: string | null;
  account: { id: string; name: string; email: string | null } | null;
}

export interface TravelerTrip {
  linkId: string;
  linkedAt: string | null;
  organization: { name: string };
  traveler: { name: string; status: string };
  bookings: {
    bookingRef: string;
    status: string;
    departureDate: string | null;
    returnDate: string | null;
    package: { name: string; tripType: string; durationDays: number } | null;
    group: { name: string; status: string; departureDate: string | null; returnDate: string | null } | null;
  }[];
  visas: {
    status: string;
    visaType: string | null;
    submittedAt: string | null;
    decidedAt: string | null;
    validUntil: string | null;
    updatedAt: string;
  }[];
}

export interface InvitationPreview {
  organization: { name: string };
  traveler: { name: string };
  expiresAt: string;
}

const linksKey = (pilgrimId: string) => ['pilgrims', pilgrimId, 'account-links'] as const;
const TRIPS_KEY = ['travelers', 'me', 'trips'] as const;

// ── Organization side ─────────────────────────────────────────────────────

export function usePilgrimAccountLinks(pilgrimId: string | undefined) {
  return useQuery({
    queryKey: linksKey(pilgrimId ?? ''),
    queryFn: async () => (await apiClient.get(`/pilgrims/${pilgrimId}/account-links`)).data.data as OrganizationAccountLink[],
    enabled: !!pilgrimId,
  });
}

export function useInviteTraveler(pilgrimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { email?: string }) =>
      (await apiClient.post(`/pilgrims/${pilgrimId}/account-links`, body)).data.data as OrganizationAccountLink,
    onSettled: () => qc.invalidateQueries({ queryKey: linksKey(pilgrimId) }),
  });
}

export function useResendInvitation(pilgrimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) =>
      (await apiClient.post(`/pilgrims/${pilgrimId}/account-links/${linkId}/resend`, {})).data.data as OrganizationAccountLink,
    onSettled: () => qc.invalidateQueries({ queryKey: linksKey(pilgrimId) }),
  });
}

export function useRevokeAccountLink(pilgrimId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ linkId, reason }: { linkId: string; reason: string }) =>
      (await apiClient.post(`/pilgrims/${pilgrimId}/account-links/${linkId}/revoke`, { reason })).data.data as OrganizationAccountLink,
    onSettled: () => qc.invalidateQueries({ queryKey: linksKey(pilgrimId) }),
  });
}

// ── Traveler side ─────────────────────────────────────────────────────────

export function useMyTrips() {
  return useQuery({
    queryKey: TRIPS_KEY,
    queryFn: async () => (await apiClient.get('/travelers/me/trips')).data.data as TravelerTrip[],
  });
}

export function usePreviewInvitation() {
  return useMutation({
    mutationFn: async (token: string) =>
      (await apiClient.post('/travelers/me/links/preview', { token })).data.data as InvitationPreview,
  });
}

export function useAnswerInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, token }: { action: 'accept' | 'decline'; token: string }) =>
      (await apiClient.post(`/travelers/me/links/${action}`, { token })).data.data,
    onSettled: () => qc.invalidateQueries({ queryKey: TRIPS_KEY }),
  });
}

export function useUnlinkTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => (await apiClient.delete(`/travelers/me/links/${linkId}`)).data.data,
    onSettled: () => qc.invalidateQueries({ queryKey: TRIPS_KEY }),
  });
}
