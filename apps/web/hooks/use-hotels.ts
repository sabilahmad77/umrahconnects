'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/*
 * Hotel workflow vocabulary. These mirror the server (platform/api/src/modules/
 * hotels/hotel-workflow.ts and dto/hotel.dto.ts); tests/server-contracts.test.ts
 * fails if they drift. The server remains authoritative: every booking it returns
 * carries `allowedTransitions`, which is what the UI offers.
 */
export const HOTEL_BOOKING_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};
export const HOTEL_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED'];
export const HOTEL_BOOKING_INITIAL_STATUSES = ['PENDING', 'CONFIRMED'];
export const HOTEL_BOOKING_SOURCES = ['EXTERNAL', 'PLATFORM_USER', 'OPERATOR', 'MARKETPLACE'];
/** Room statuses a manager sets by hand; OCCUPIED follows check-in and check-out. */
export const ROOM_MANUAL_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];
export const HOTEL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
export const HOTEL_CONTRACT_TYPES = ['ALLOTMENT', 'ON_DEMAND', 'GUARANTEED'];

/** The verb shown for a booking move. */
export const BOOKING_ACTION_LABEL: Record<string, string> = {
  CONFIRMED: 'Confirm',
  CHECKED_IN: 'Check in',
  CHECKED_OUT: 'Check out',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancel booking',
};

// ── Hotels ──
export function useHotelList(params?: { page?: number; limit?: number; search?: string; city?: string; status?: string }) {
  return useQuery({
    queryKey: ['hotels', 'list', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/hotels', { params });
      return data.data as { items: any[]; total: number; page: number; limit: number; totalPages: number };
    },
  });
}

export function useHotel(id?: string) {
  return useQuery({
    queryKey: ['hotels', id, 'detail'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, any>) => (await apiClient.post('/hotels', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useUpdateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/hotels/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useDeleteHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/hotels/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

// ── Hotel owner dashboard stats ──
export function useHotelOwnerStats() {
  return useQuery({
    queryKey: ['hotels', 'owner-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/hotels/stats');
      return data.data as any;
    },
  });
}

// ── Room types ──
export function useHotelRoomTypes(id?: string) {
  return useQuery({
    queryKey: ['hotels', id, 'room-types'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${id}/room-types`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hotelId, ...body }: { hotelId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/hotels/${hotelId}/room-types`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useUpdateRoomType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomTypeId, ...body }: { roomTypeId: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/hotels/room-types/${roomTypeId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

// ── Rooms ──
export function useHotelRooms(id?: string) {
  return useQuery({
    queryKey: ['hotels', id, 'rooms'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${id}/rooms`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hotelId, ...body }: { hotelId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/hotels/${hotelId}/rooms`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roomId, ...body }: { roomId: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/hotels/rooms/${roomId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (roomId: string) => {
      await apiClient.delete(`/hotels/rooms/${roomId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

/** Rooms of a hotel with whether each is free for the stay (server-computed). */
export function useRoomAvailability(hotelId?: string, stay?: { checkIn?: string; checkOut?: string; excludeBookingId?: string }) {
  const ready = !!hotelId && !!stay?.checkIn && !!stay?.checkOut && stay.checkOut > stay.checkIn;
  return useQuery({
    queryKey: ['hotels', hotelId, 'room-availability', stay],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${hotelId}/room-availability`, { params: stay });
      return data.data as any[];
    },
    enabled: ready,
  });
}

// ── Hotel bookings ──
export function useHotelBookings(params?: { hotelId?: string; status?: string }) {
  return useQuery({
    queryKey: ['hotels', 'bookings', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/hotels/bookings', { params });
      return data.data as any[];
    },
  });
}

export function useHotelBooking(id?: string) {
  return useQuery({
    queryKey: ['hotels', 'bookings', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/bookings/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useCreateHotelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, any>) => {
      const { data } = await apiClient.post('/hotels/bookings', body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useUpdateHotelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/hotels/bookings/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

// ── Allotments (operator contracts) and room assignments ──
export function useHotelAllotments(id?: string) {
  return useQuery({
    queryKey: ['hotels', id, 'allotments'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${id}/allotments`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateAllotment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hotelId, ...body }: { hotelId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/hotels/${hotelId}/allotments`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useUpdateAllotment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ allotmentId, ...body }: { allotmentId: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/hotels/allotments/${allotmentId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useRoomAssignments(hotelId?: string, enabled = true) {
  return useQuery({
    queryKey: ['hotels', hotelId, 'assignments'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/hotels/${hotelId}/assignments`);
      return data.data as any[];
    },
    enabled: !!hotelId && enabled,
  });
}

export function useCreateRoomAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hotelId, ...body }: { hotelId: string } & Record<string, any>) => {
      const { data } = await apiClient.post(`/hotels/${hotelId}/assignments`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

export function useReleaseRoomAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ hotelId, assignmentId }: { hotelId: string; assignmentId: string }) => {
      const { data } = await apiClient.delete(`/hotels/${hotelId}/assignments/${assignmentId}`);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hotels'] }),
  });
}

/** Operator bookings (with their travelers) that rooms can be assigned to. */
export function useAssignableBookings(enabled = true) {
  return useQuery({
    queryKey: ['hotels', 'assignable-bookings'],
    queryFn: async () => {
      const { data } = await apiClient.get('/bookings', { params: { limit: 100 } });
      return (data.data?.items ?? data.data ?? []) as any[];
    },
    enabled,
  });
}
