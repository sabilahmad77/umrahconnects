'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function usePilgrim(id?: string) {
  return useQuery({
    queryKey: ['pilgrims', id, 'detail'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/pilgrims/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useAddPilgrimDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pilgrimId, ...body }: { pilgrimId: string; type: string; fileUrl: string; fileName?: string; mimeType?: string; expiresAt?: string }) => {
      const { data } = await apiClient.post(`/pilgrims/${pilgrimId}/documents`, body);
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['pilgrims', vars.pilgrimId] }),
  });
}

export function useAssignPilgrimToFamilyGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, familyGroupId }: { id: string; familyGroupId: string | null }) => {
      const { data } = await apiClient.put(`/pilgrims/${id}/family-group`, { familyGroupId });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pilgrims'] }),
  });
}

export function useAssignPilgrimToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pilgrimId, bookingId }: { pilgrimId: string; bookingId: string }) => {
      const { data } = await apiClient.post(`/pilgrims/${pilgrimId}/bookings`, { bookingId });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pilgrims'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
