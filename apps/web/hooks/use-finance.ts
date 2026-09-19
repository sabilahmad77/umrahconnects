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

// ── Update invoice fields (customer, dates, notes; amounts while DRAFT) ──
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/finance/invoices/${id}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

/**
 * Invoice lifecycle moves (finance:invoice:approve). Issuing and voiding have
 * their own endpoints; SENT / OVERDUE / CANCELLED go through /status, which
 * applies the same transition rules. PAID is never set by hand.
 */
export function useInvoiceTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'ISSUED' | 'SENT' | 'OVERDUE' | 'VOID' | 'CANCELLED';
    }) => {
      if (status === 'ISSUED')
        return (await apiClient.put(`/finance/invoices/${id}/issue`)).data.data;
      if (status === 'VOID') return (await apiClient.put(`/finance/invoices/${id}/void`)).data.data;
      return (await apiClient.put(`/finance/invoices/${id}/status`, { status })).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance'] }),
  });
}

/**
 * Record a manual payment (cash, bank transfer, card terminal…). Amount in
 * major units; the idempotency key makes a repeated submit return the first
 * recording instead of a second payment.
 */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      /** Integer cents: money travels in minor units. */
      amountCents: number;
      method: string;
      referenceNumber?: string;
      paidAt?: string;
      idempotencyKey: string;
    }) => {
      const { data } = await apiClient.post(`/finance/invoices/${id}/payments`, body);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ── Cancel a draft invoice (DELETE; issued invoices are voided instead) ──
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
export function useFinancePayments(params?: { page?: number; limit?: number; status?: string }) {
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

/** Refund a manual payment (amount in major units; omitted = the whole refundable balance). */
export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      amount,
      reason,
    }: {
      id: string;
      amount?: number;
      reason?: string;
    }) => {
      const { data } = await apiClient.post(`/finance/payments/${id}/refund`, { amount, reason });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/** Invoices linked to one operator booking. */
export function useBookingInvoices(bookingId?: string) {
  return useQuery({
    queryKey: ['finance', 'invoices', 'booking', bookingId],
    queryFn: async () => {
      const { data } = await apiClient.get('/finance/invoices', {
        params: { bookingId, limit: 20 },
      });
      return data.data as { items: any[]; total: number };
    },
    enabled: !!bookingId,
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
