'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Vehicles ──
export function useVehicle(id?: string) {
  return useQuery({
    queryKey: ['transport', 'vehicles', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/transport/vehicles/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/transport/vehicles/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/transport/vehicles/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useAssignDriverToVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicleId, driverId, isPrimary }: { vehicleId: string; driverId: string; isPrimary?: boolean }) => {
      const { data } = await apiClient.post(`/transport/vehicles/${vehicleId}/drivers`, { driverId, isPrimary });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useUnassignDriverFromVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicleId, driverId }: { vehicleId: string; driverId: string }) => {
      await apiClient.delete(`/transport/vehicles/${vehicleId}/drivers/${driverId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

// ── Drivers ──
export function useDriver(id?: string) {
  return useQuery({
    queryKey: ['transport', 'drivers', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/transport/drivers/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/transport/drivers/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/transport/drivers/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

// ── Routes ──
export function useRoute(id?: string) {
  return useQuery({
    queryKey: ['transport', 'routes', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/transport/routes/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useUpdateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/transport/routes/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/transport/routes/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

// ── Assignments / Bookings ──
export function useAssignments(params?: { status?: string; search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['transport', 'assignments', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/assignments', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useAssignment(id?: string) {
  return useQuery({
    queryKey: ['transport', 'assignments', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/transport/assignments/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await apiClient.post('/transport/assignments', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/transport/assignments/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

export function useCancelAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post(`/transport/assignments/${id}/cancel`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}

// ── Transport stats (richer than use-api's old version) ──
export function useTransportStatsFull() {
  return useQuery({
    queryKey: ['transport', 'stats', 'full'],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/stats');
      return data.data as any;
    },
  });
}
