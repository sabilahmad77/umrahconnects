'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Invoice detail ──
export function useInvoice(id?: string) {
  return useQuery({
    queryKey: ['finance', 'invoices', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/finance/invoices/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

// ── Update invoice ──
// Routes status changes to dedicated endpoints when available
// (issue, void), otherwise falls through to a generic PUT.
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const status = body.status;
      if (status === 'VOID' || status === 'CANCELLED') {
        const { data } = await apiClient.put(`/finance/invoices/${id}/void`);
        return data.data;
      }
      if (status === 'ISSUED' || status === 'SENT') {
        const { data } = await apiClient.put(`/finance/invoices/${id}/issue`);
        return data.data;
      }
      const { data } = await apiClient.put(`/finance/invoices/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

// ── Mark invoice paid ──
// Records a payment for the outstanding balance.
export function useMarkInvoicePaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amountCents, method, referenceNumber }: {
      id: string;
      amountCents: number;
      method?: string;
      referenceNumber?: string;
    }) => {
      const { data } = await apiClient.post(`/finance/invoices/${id}/payments`, {
        amount: amountCents / 100,
        method: method ?? 'cash',
        referenceNumber,
        paidAt: new Date().toISOString(),
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

// ── Delete (archive) invoice ──
export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/finance/invoices/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

// ── Create invoice ──
export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await apiClient.post('/finance/invoices', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

// ── Dashboard stats ──
export function useFinanceDashboardStats() {
  return useQuery({
    queryKey: ['finance', 'dashboard-stats'],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/dashboard-stats');
      return data.data as any;
    },
  });
}

// ── Payments ──
export function useFinancePayments(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['finance', 'payments', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/payments', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/finance/payments/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount?: number }) => {
      const { data } = await apiClient.post(`/finance/payments/${id}/refund`, { amount });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

// ── Budget plans ──
export function useBudgetPlans(params?: { status?: string }) {
  return useQuery({
    queryKey: ['finance', 'budget-plans', params],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/budget-plans', { params });
      return data.data as { items: any[]; total: number };
    },
  });
}

export function useBudgetPlan(id?: string) {
  return useQuery({
    queryKey: ['finance', 'budget-plans', id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/finance/budget-plans/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useCreateBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { data } = await apiClient.post('/finance/budget-plans', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useUpdateBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/finance/budget-plans/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

export function useDeleteBudgetPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/finance/budget-plans/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}
