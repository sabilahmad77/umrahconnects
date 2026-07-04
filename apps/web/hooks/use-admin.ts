'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Stats ──
export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await apiClient.get('/admin/stats')).data.data as any,
  });
}

// ── Tenants ──
export function useAdminTenants(params?: { status?: string; type?: string; search?: string }) {
  return useQuery({
    queryKey: ['admin', 'tenants', params],
    queryFn: async () => (await apiClient.get('/admin/tenants', { params })).data.data as { items: any[]; total: number },
  });
}
export function useAdminTenant(id?: string) {
  return useQuery({
    queryKey: ['admin', 'tenants', id],
    queryFn: async () => (await apiClient.get(`/admin/tenants/${id}`)).data.data as any,
    enabled: !!id,
  });
}
export function useSetTenantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiClient.put(`/admin/tenants/${id}/status`, { status })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useArchiveTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/admin/tenants/${id}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ── Users ──
export function useAdminUsers(params?: { status?: string; tenantId?: string; search?: string }) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: async () => (await apiClient.get('/admin/users', { params })).data.data as { items: any[]; total: number },
  });
}
export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await apiClient.put(`/admin/users/${id}/status`, { status })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useForceLogout() {
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.post(`/admin/users/${id}/force-logout`)).data.data,
  });
}
export function useAssignUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) =>
      (await apiClient.post(`/admin/users/${userId}/roles`, { roleId })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useRemoveUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) =>
      (await apiClient.delete(`/admin/users/${userId}/roles/${roleId}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ── KYC ──
export function useAdminKyc(status?: string) {
  return useQuery({
    queryKey: ['admin', 'kyc', status],
    queryFn: async () => (await apiClient.get('/admin/kyc', { params: { status } })).data.data as any[],
  });
}
export function useApproveKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) =>
      (await apiClient.put(`/admin/kyc/${id}/approve`, { notes })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useRejectKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await apiClient.put(`/admin/kyc/${id}/reject`, { reason })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useCreateKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { tenantId: string; registrySource?: string; documents?: any[] }) =>
      (await apiClient.post('/admin/kyc', body)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ── Roles & permissions ──
export function useAdminRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => (await apiClient.get('/admin/roles')).data.data as any[],
  });
}
export function useAdminRole(id?: string) {
  return useQuery({
    queryKey: ['admin', 'roles', id],
    queryFn: async () => (await apiClient.get(`/admin/roles/${id}`)).data.data as any,
    enabled: !!id,
  });
}
export function useAdminPermissions() {
  return useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: async () => (await apiClient.get('/admin/permissions')).data.data as any[],
  });
}

// ── Marketplace listings (cross-tenant) ──
export function useAdminListings(params?: { status?: string; type?: string; search?: string }) {
  return useQuery({
    queryKey: ['admin', 'listings', params],
    queryFn: async () => (await apiClient.get('/admin/listings', { params })).data.data as { items: any[]; total: number },
  });
}
export function useApproveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.put(`/admin/listings/${id}/approve`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}
export function useAdminRemoveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await apiClient.delete(`/admin/listings/${id}`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

// ── Bookings + finance ──
export function useAdminBookings(params?: any) {
  return useQuery({
    queryKey: ['admin', 'bookings', params],
    queryFn: async () => (await apiClient.get('/admin/bookings', { params })).data.data as { items: any[]; total: number },
  });
}
export function useAdminFinance() {
  return useQuery({
    queryKey: ['admin', 'finance'],
    queryFn: async () => (await apiClient.get('/admin/finance')).data.data as any,
  });
}

// ── Audit logs ──
export function useAdminAuditLogs(params?: any) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', params],
    queryFn: async () => (await apiClient.get('/admin/audit-logs', { params })).data.data as { items: any[]; total: number },
  });
}

// ── Settings ──
export function useAdminSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await apiClient.get('/admin/settings')).data.data as any,
  });
}
