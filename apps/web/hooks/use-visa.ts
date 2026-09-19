'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/*
 * Visa application workflow. Mirrors platform/api/src/modules/compliance/visa-workflow.ts
 * (tests/server-contracts.test.ts fails if they drift). Every application the server
 * returns carries `allowedTransitions`, which is what the UI offers.
 */
export const VISA_TRANSITIONS: Record<string, string[]> = {
  NOT_STARTED: ['DOCUMENTS_COLLECTING', 'SUBMITTED', 'CANCELLED'],
  DOCUMENTS_COLLECTING: ['NOT_STARTED', 'SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['DOCUMENTS_COLLECTING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['DOCUMENTS_COLLECTING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['EXPIRED', 'CANCELLED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};
export const VISA_STATUSES = ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
/** Moves the plain edit makes; submit / approve / reject / cancel have their own actions. */
export const VISA_EDIT_STATUSES = ['NOT_STARTED', 'DOCUMENTS_COLLECTING', 'UNDER_REVIEW', 'EXPIRED'];
export const VISA_TERMINAL_STATUSES = ['REJECTED', 'EXPIRED', 'CANCELLED'];

export const VISA_STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  NOT_STARTED: { label: 'Not started', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  DOCUMENTS_COLLECTING: { label: 'Collecting documents', color: 'bg-yellow-100 text-yellow-800', dot: 'bg-yellow-500' },
  SUBMITTED: { label: 'Submitted', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  UNDER_REVIEW: { label: 'Under review', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  EXPIRED: { label: 'Expired', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-300' },
};

// ── Visa Applications ──
export function useVisaList(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['compliance', 'visas', 'list', params],
    queryFn: async () =>
      (await apiClient.get('/compliance/visas', { params })).data.data as { items: any[]; total: number; page: number; limit: number },
  });
}

export function useVisaStats() {
  return useQuery({
    queryKey: ['compliance', 'stats'],
    queryFn: async () =>
      (await apiClient.get('/compliance/visas/stats')).data.data as { byStatus: Record<string, number>; total: number; decided: number; successRate: number },
  });
}

export function useVisa(id?: string) {
  return useQuery({
    queryKey: ['compliance', 'visas', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/compliance/visas/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useCreateVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const { data } = await apiClient.post('/compliance/visas', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useUpdateVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/compliance/visas/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

/** Cancels (withdraws) an application; the record and its timeline stay. */
export function useCancelVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/compliance/visas/${id}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useSubmitVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.put(`/compliance/visas/${id}/submit`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useApproveVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, visaNumber, expiresAt }: { id: string; visaNumber: string; expiresAt?: string }) =>
      (await apiClient.put(`/compliance/visas/${id}/approve`, { visaNumber, expiresAt: expiresAt || undefined })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useRejectVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await apiClient.put(`/compliance/visas/${id}/reject`, { reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

// ── Dashboard stats ──
export function useVisaDashboardStats() {
  return useQuery({
    queryKey: ['compliance', 'dashboard-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/compliance/visas/dashboard-stats');
      return data.data as any;
    },
  });
}

// ── Documents ──
export function useVisaDocuments(visaId?: string) {
  return useQuery({
    queryKey: ['compliance', 'visas', visaId, 'documents'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/compliance/visas/${visaId}/documents`);
      return data.data as any[];
    },
    enabled: !!visaId,
  });
}

export function useAllVisaDocuments(status?: string) {
  return useQuery({
    queryKey: ['compliance', 'all-documents', status],
    queryFn: async () => {
      const { data } = await apiClient.get('/compliance/visas/documents', { params: { status } });
      return data.data as any[];
    },
  });
}

export function useAddVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, ...body }: { visaId: string; name: string; type?: string; expiresAt?: string; notes?: string }) => {
      const { data } = await apiClient.post(`/compliance/visas/${visaId}/documents`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

/** Records RECEIVED/MISSING, notes or the expiry date; files only arrive as versions. */
export function useUpdateVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId, ...body }: { visaId: string; docId: string; status?: string; expiresAt?: string | null; notes?: string }) => {
      const { data } = await apiClient.put(`/compliance/visas/${visaId}/documents/${docId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useRemoveVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId }: { visaId: string; docId: string }) => {
      await apiClient.delete(`/compliance/visas/${visaId}/documents/${docId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

// ── Document management (versioned table, not the legacy JSON blob) ──
export function useVisaDocument(visaId?: string, docId?: string) {
  return useQuery({
    queryKey: ['compliance', 'visas', visaId, 'documents', docId],
    queryFn: async () => (await apiClient.get(`/compliance/visas/${visaId}/documents/${docId}`)).data.data as any,
    enabled: !!visaId && !!docId,
  });
}

export function useVisaDocumentVersions(visaId?: string, docId?: string) {
  return useQuery({
    queryKey: ['compliance', 'visas', visaId, 'documents', docId, 'versions'],
    queryFn: async () =>
      (await apiClient.get(`/compliance/visas/${visaId}/documents/${docId}/versions`)).data.data as any[],
    enabled: !!visaId && !!docId,
  });
}

export function useVisaDocumentStats() {
  return useQuery({
    queryKey: ['compliance', 'document-stats'],
    queryFn: async () => (await apiClient.get('/compliance/visas/documents/stats')).data.data as any,
  });
}

/** Upload or replace the file behind a document — always creates a version. */
export function useUploadVisaDocumentVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId, file }: { visaId: string; docId: string; file: File }) => {
      const body = new FormData();
      body.append('file', file);
      const { data } = await apiClient.post(
        `/compliance/visas/${visaId}/documents/${docId}/versions`, body,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useVerifyVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId }: { visaId: string; docId: string }) =>
      (await apiClient.put(`/compliance/visas/${visaId}/documents/${docId}/verify`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useRejectVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId, reason }: { visaId: string; docId: string; reason: string }) =>
      (await apiClient.put(`/compliance/visas/${visaId}/documents/${docId}/reject`, { reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}
