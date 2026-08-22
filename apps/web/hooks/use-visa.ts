'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Visa Applications ──
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

export function useDeleteVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/compliance/visas/${id}`);
    },
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
    mutationFn: async ({ id, visaNumber }: { id: string; visaNumber?: string }) =>
      (await apiClient.put(`/compliance/visas/${id}/approve`, { visaNumber })).data.data,
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
    mutationFn: async ({ visaId, ...body }: { visaId: string; name: string; type?: string; url?: string; status?: string; expiresAt?: string }) => {
      const { data } = await apiClient.post(`/compliance/visas/${visaId}/documents`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance'] }),
  });
}

export function useUpdateVisaDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ visaId, docId, status, url }: { visaId: string; docId: string; status: string; url?: string }) => {
      const { data } = await apiClient.put(`/compliance/visas/${visaId}/documents/${docId}`, { status, url });
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
