'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/*
 * Transport workflow vocabulary. These mirror the server (platform/api/src/modules/
 * transport/transport-workflow.ts and dto/transport.dto.ts); tests/server-contracts.test.ts
 * fails if they drift. Every trip the server returns carries `allowedTransitions`,
 * which is what the UI offers.
 */
export const TRANSPORT_ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'CONFIRMED', 'CANCELLED'],
  SCHEDULED: ['CONFIRMED', 'IN_PROGRESS', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};
export const ASSIGNMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
export const ASSIGNMENT_INITIAL_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED'];
export const CUSTOMER_TYPES = ['PLATFORM_USER', 'OPERATOR', 'EXTERNAL'];
/** Statuses set by hand; IN_SERVICE / ON_TRIP / FULLY_BOOKED follow the trips and seats. */
export const VEHICLE_MANUAL_STATUSES = ['AVAILABLE', 'BOOKED', 'UNDER_MAINTENANCE', 'INACTIVE'];
export const DRIVER_MANUAL_STATUSES = ['AVAILABLE', 'ASSIGNED', 'OFF_DUTY', 'INACTIVE'];
export const ROUTE_MANUAL_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'INACTIVE'];
/** Routes that sell seats. */
export const BOOKABLE_ROUTE_STATUSES = ['ACTIVE', 'FULLY_BOOKED'];

/** The verb shown for a trip move. */
export const TRIP_ACTION_LABEL: Record<string, string> = {
  SCHEDULED: 'Schedule',
  CONFIRMED: 'Confirm',
  IN_PROGRESS: 'Start trip',
  COMPLETED: 'Complete trip',
  CANCELLED: 'Cancel trip',
};

/** `datetime-local` value (local time) for an ISO timestamp — and back — without shifting the hour. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Lists ──
export function useVehicleList(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['transport', 'vehicles', 'list', params],
    queryFn: async () => (await apiClient.get('/transport/vehicles', { params })).data.data as { items: any[]; total: number },
  });
}

export function useDriverList(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['transport', 'drivers', 'list', params],
    queryFn: async () => (await apiClient.get('/transport/drivers', { params })).data.data as { items: any[]; total: number },
  });
}

export function useRouteList(params?: { page?: number; limit?: number; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['transport', 'routes', 'list', params],
    queryFn: async () => (await apiClient.get('/transport/routes', { params })).data.data as { items: any[]; total: number },
  });
}

function useTransportCreate(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, any>) => (await apiClient.post(path, body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }),
  });
}
export const useCreateVehicle = () => useTransportCreate('/transport/vehicles');
export const useCreateDriver = () => useTransportCreate('/transport/drivers');
export const useCreateRoute = () => useTransportCreate('/transport/routes');
export const useCreateTasreeh = () => useTransportCreate('/transport/tasreeh');

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

// ── Tasreeh permits ──
export function useTasreehPermits(enabled = true) {
  return useQuery({
    queryKey: ['transport', 'tasreeh'],
    queryFn: async () => (await apiClient.get('/transport/tasreeh')).data.data as any[],
    enabled,
  });
}

// ── Transport stats ──
export function useTransportStatsFull() {
  return useQuery({
    queryKey: ['transport', 'stats', 'full'],
    queryFn: async () => {
      const { data } = await apiClient.get('/transport/stats');
      return data.data as any;
    },
  });
}
