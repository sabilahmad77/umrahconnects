'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

const KEY = ['payments'];

export interface ProviderStatus {
  active: string;
  providers: { name: string; configured: boolean; missing: string[]; sandbox: boolean }[];
}

export function usePaymentProviders() {
  return useQuery({
    queryKey: [...KEY, 'providers'],
    queryFn: async () => (await apiClient.get('/payments/providers')).data.data as ProviderStatus,
  });
}

export function usePayment(id?: string) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: async () => (await apiClient.get(`/payments/${id}`)).data.data as any,
    enabled: !!id,
  });
}

function useGatewayMutation<TArgs>(fn: (args: TArgs) => Promise<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['finance'] });
    },
  });
}

export function useCreatePaymentIntent() {
  return useGatewayMutation(async (body: Record<string, any>) =>
    (await apiClient.post('/payments/intents', body)).data.data);
}

export function useConfirmPaymentIntent() {
  return useGatewayMutation(async ({ id, scenario }: { id: string; scenario?: string }) =>
    (await apiClient.post(`/payments/intents/${id}/confirm`, { scenario })).data.data);
}

export function useRefundPayment() {
  return useGatewayMutation(async ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) =>
    (await apiClient.post(`/payments/${id}/refund`, { amount, reason })).data.data);
}
