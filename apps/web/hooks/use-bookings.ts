'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

export function useBooking(id?: string) {
  return useQuery({
    queryKey: ['bookings', id, 'detail'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/bookings/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/bookings/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await apiClient.put(`/bookings/${id}/status`, { status });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useAssignGroupToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const { data } = await apiClient.put(`/bookings/${id}/assign-group`, { groupId });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useAssignPackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, packageId }: { id: string; packageId: string }) => {
      const { data } = await apiClient.put(`/bookings/${id}/assign-package`, { packageId });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useSetBookingPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; paidAmount?: number; status?: string }) => {
      const { data } = await apiClient.put(`/bookings/${id}/payment`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await apiClient.post(`/bookings/${id}/cancel`, { reason });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useGenerateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data } = await apiClient.post(`/bookings/${bookingId}/generate-invoice`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useAddPilgrimToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, pilgrimId }: { bookingId: string; pilgrimId: string }) => {
      const { data } = await apiClient.post(`/bookings/${bookingId}/pilgrims`, { pilgrimId });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useRemovePilgrimFromBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, pilgrimId }: { bookingId: string; pilgrimId: string }) => {
      await apiClient.delete(`/bookings/${bookingId}/pilgrims/${pilgrimId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}
