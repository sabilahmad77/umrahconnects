'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

const KEY = ['visa-requests'];

export interface VisaRequestFilters {
  status?: string;
  category?: string;
  priority?: string;
  assigneeId?: string;
  q?: string;
  overdue?: string;
  page?: number;
  limit?: number;
}

export function useVisaRequests(filters: VisaRequestFilters = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: async () => {
      const { data } = await apiClient.get('/visa-requests', { params: filters });
      return data.data as { items: any[]; total: number; page: number; limit: number };
    },
  });
}

export function useVisaRequestStats() {
  return useQuery({
    queryKey: [...KEY, 'stats'],
    queryFn: async () => (await apiClient.get('/visa-requests/stats')).data.data as any,
  });
}

export function useVisaRequestAssignees() {
  return useQuery({
    queryKey: [...KEY, 'assignees'],
    queryFn: async () =>
      (await apiClient.get('/visa-requests/assignees')).data.data as { id: string; name: string; email: string }[],
  });
}

export function useVisaRequest(id?: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: async () => (await apiClient.get(`/visa-requests/${id}`)).data.data as any,
    enabled: !!id,
  });
}

/** Every mutation invalidates the whole namespace so list, stats and detail agree. */
function useTicketMutation<TArgs>(fn: (args: TArgs) => Promise<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useCreateVisaRequest() {
  return useTicketMutation(async (body: Record<string, any>) =>
    (await apiClient.post('/visa-requests', body)).data.data);
}

export function useUpdateVisaRequest() {
  return useTicketMutation(async ({ id, ...body }: { id: string } & Record<string, any>) =>
    (await apiClient.patch(`/visa-requests/${id}`, body)).data.data);
}

export function useAssignVisaRequest() {
  return useTicketMutation(async ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
    (await apiClient.put(`/visa-requests/${id}/assign`, { assigneeId: assigneeId || undefined })).data.data);
}

export function useChangeVisaRequestStatus() {
  return useTicketMutation(async ({ id, status }: { id: string; status: string }) =>
    (await apiClient.put(`/visa-requests/${id}/status`, { status })).data.data);
}

export function useAddVisaRequestNote() {
  return useTicketMutation(async ({ id, body, visibility }: { id: string; body: string; visibility: string }) =>
    (await apiClient.post(`/visa-requests/${id}/notes`, { body, visibility })).data.data);
}

export function useEscalateVisaRequest() {
  return useTicketMutation(async ({ id, reason }: { id: string; reason: string }) =>
    (await apiClient.put(`/visa-requests/${id}/escalate`, { reason })).data.data);
}

export function useResolveVisaRequest() {
  return useTicketMutation(async ({ id, resolution }: { id: string; resolution: string }) =>
    (await apiClient.put(`/visa-requests/${id}/resolve`, { resolution })).data.data);
}

export function useCloseVisaRequest() {
  return useTicketMutation(async ({ id, note }: { id: string; note?: string }) =>
    (await apiClient.put(`/visa-requests/${id}/close`, { note })).data.data);
}

export function useReopenVisaRequest() {
  return useTicketMutation(async ({ id, reason }: { id: string; reason: string }) =>
    (await apiClient.put(`/visa-requests/${id}/reopen`, { reason })).data.data);
}
