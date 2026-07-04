'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Hotel detail ──
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

// ── Allotments (legacy) ──
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
