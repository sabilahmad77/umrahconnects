'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import {
  checkoutReducer,
  CheckoutEvent,
  CheckoutState,
  initialCheckoutState,
  nextPollDelay,
  PaymentView,
} from '@/components/finance/checkout-machine';

const KEY = ['payments'];

export interface ProviderStatus {
  active: string;
  providers: {
    name: string;
    configured: boolean;
    missing: string[];
    sandbox: boolean;
    publishableKey?: string | null;
    testMode?: boolean;
  }[];
}

export function usePaymentProviders() {
  return useQuery({
    queryKey: [...KEY, 'providers'],
    queryFn: async () => (await apiClient.get('/payments/providers')).data.data as ProviderStatus,
    staleTime: 60_000,
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
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

/** Staff: refund a captured gateway payment (amount in major units; omitted = the whole refundable balance). */
export function useRefundPayment() {
  return useGatewayMutation(
    async ({ id, amount, reason }: { id: string; amount?: number; reason?: string }) =>
      (await apiClient.post(`/payments/${id}/refund`, { amount, reason })).data.data,
  );
}

/** Staff: abandon an open card attempt (the provider invalidates it first). */
export function useCancelPaymentIntent() {
  return useGatewayMutation(
    async (id: string) => (await apiClient.post(`/payments/intents/${id}/cancel`, {})).data.data,
  );
}

/** A staff payment row → the shared checkout view. */
export function staffPaymentView(p: any): PaymentView {
  return {
    paymentId: p.id,
    status: p.status,
    amountCents: Number(p.amountCents ?? 0),
    currency: p.currency ?? 'SAR',
    provider: p.gateway,
    providerStatus: p.gatewayStatus ?? null,
    failureReason: p.failureReason ?? null,
    clientSecret: p.clientSecret,
  };
}

/** Why a request failed, and whether it means "no provider here" rather than "try again". */
function describeError(error: unknown): { message: string; unavailable: boolean } {
  const status = (error as any)?.response?.status;
  return {
    message: apiErrorMessage(error, 'The payment could not be started. Try again.'),
    unavailable: status === 503 && /not (enabled|configured)/i.test(apiErrorMessage(error, '')),
  };
}

interface FlowApi {
  /** Open or resume the attempt; resolves to the server view (with a client secret while payable). */
  start: () => Promise<PaymentView>;
  /** Read the server's current status. */
  read: (paymentId: string) => Promise<PaymentView>;
  /** Development sandbox only: finish the attempt with a deterministic outcome. */
  sandboxComplete: (
    paymentId: string,
    scenario: 'succeed' | 'decline_at_capture',
  ) => Promise<PaymentView>;
  /** Staff Stripe payments reconcile once, server-side, after the browser confirmation. */
  afterConfirm?: (paymentId: string) => Promise<PaymentView>;
}

const WAITING = (s: CheckoutState) =>
  s.phase === 'verifying' ||
  s.phase === 'processing' ||
  (s.phase === 'action_required' && s.awaitingOutcome);

/**
 * Drives the checkout state machine against the API: start/resume, bounded
 * status polling after a submit or a redirect return, and the sandbox path.
 * One instance per checkout on screen; start and sandbox requests never overlap.
 */
export function usePaymentFlow(
  api: FlowApi,
  opts: { onOutcome?: (state: CheckoutState) => void } = {},
) {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const apiRef = useRef(api);
  apiRef.current = api;
  const onOutcome = useRef(opts.onOutcome);
  onOutcome.current = opts.onOutcome;
  const busy = useRef(false);
  const send = useCallback((e: CheckoutEvent) => dispatch(e), []);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    dispatch({ type: 'START' });
    try {
      dispatch({ type: 'STARTED', view: await apiRef.current.start() });
    } catch (error) {
      const { message, unavailable } = describeError(error);
      dispatch({ type: 'START_FAILED', message, unavailable });
    } finally {
      busy.current = false;
    }
  }, []);

  /**
   * Load an existing attempt (reload, second tab, return from a bank page). A
   * Stripe attempt that is still open is watched until the server reports its
   * outcome; a sandbox attempt only ever changes when someone completes it.
   */
  const load = useCallback(async (paymentId: string, awaitOutcome: boolean) => {
    dispatch({ type: 'START' });
    try {
      const view = await apiRef.current.read(paymentId);
      dispatch({ type: 'STARTED', view });
      if (
        awaitOutcome &&
        view.provider !== 'sandbox' &&
        ['PENDING', 'PROCESSING'].includes(String(view.status))
      ) {
        dispatch({ type: 'AWAIT_OUTCOME' });
      }
    } catch (error) {
      dispatch({
        type: 'START_FAILED',
        message: apiErrorMessage(error, 'This payment could not be loaded.'),
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    const id = stateRef.current.view?.paymentId;
    if (!id) return;
    try {
      dispatch({ type: 'SERVER', view: await apiRef.current.read(id) });
    } catch (error) {
      dispatch({
        type: 'SERVER_ERROR',
        message: apiErrorMessage(error, 'The payment status could not be checked. Try again.'),
      });
    }
  }, []);

  /** Development sandbox: the server answers with the outcome, so nothing is polled meanwhile. */
  const sandbox = useCallback(
    async (scenario: 'succeed' | 'decline_at_capture') => {
      const id = stateRef.current.view?.paymentId;
      if (!id || busy.current) return;
      busy.current = true;
      dispatch({ type: 'SUBMIT' });
      try {
        dispatch({ type: 'SERVER', view: await apiRef.current.sandboxComplete(id, scenario) });
      } catch (error) {
        dispatch({
          type: 'SERVER_ERROR',
          message: apiErrorMessage(error, 'The test payment could not be completed.'),
        });
        await refresh();
      } finally {
        busy.current = false;
      }
    },
    [refresh],
  );

  // Bounded polling while the server has not reported an outcome yet.
  useEffect(() => {
    const id = state.view?.paymentId;
    const delay = nextPollDelay(state);
    if (delay === null || !id) {
      if (WAITING(state) && !state.gaveUp && state.polls > 0) dispatch({ type: 'GIVE_UP' });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const reconcile =
          state.polls === 0 && state.view?.provider === 'stripe' && apiRef.current.afterConfirm;
        dispatch({
          type: 'SERVER',
          view: reconcile ? await reconcile(id) : await apiRef.current.read(id),
        });
      } catch (error) {
        dispatch({
          type: 'SERVER_ERROR',
          message: apiErrorMessage(error, 'The payment status could not be checked.'),
        });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [state]);

  // Tell the page once per outcome (e.g. to refresh the booking or the invoice).
  useEffect(() => {
    if (['succeeded', 'refunded', 'failed', 'on_hold', 'processing'].includes(state.phase)) {
      onOutcome.current?.(stateRef.current);
    }
  }, [state.phase]);

  return { state, send, start, load, refresh, sandbox };
}

/** Traveler checkout for one marketplace booking (read lazily: it may come from the loaded attempt). */
export function checkoutApi(listingBookingId: () => string | undefined): FlowApi {
  return {
    start: async () =>
      (await apiClient.post('/payments/checkout', { listingBookingId: listingBookingId() })).data
        .data as PaymentView,
    read: async (id) => (await apiClient.get(`/payments/checkout/${id}`)).data.data as PaymentView,
    sandboxComplete: async (id, scenario) =>
      (await apiClient.post(`/payments/checkout/${id}/sandbox-complete`, { scenario })).data
        .data as PaymentView,
  };
}

/**
 * Staff card payment on an invoice. `start` opens an attempt for `amount`
 * (major units) with a per-attempt idempotency key, or resumes `resumeId`.
 */
export function invoicePaymentApi(input: {
  invoiceId: string;
  /** Integer cents: money travels in minor units. */
  amountCents?: number;
  idempotencyKey?: string;
  resumeId?: string;
}): FlowApi {
  return {
    start: async () => {
      const { data } = input.resumeId
        ? await apiClient.post(`/payments/intents/${input.resumeId}/resume`, {})
        : await apiClient.post('/payments/intents', {
            invoiceId: input.invoiceId,
            amountCents: input.amountCents,
            idempotencyKey: input.idempotencyKey,
          });
      return staffPaymentView(data.data);
    },
    read: async (id) => staffPaymentView((await apiClient.get(`/payments/${id}`)).data.data),
    sandboxComplete: async (id, scenario) =>
      staffPaymentView(
        (await apiClient.post(`/payments/intents/${id}/confirm`, { scenario })).data.data,
      ),
    // One server-side reconcile after the browser confirmation; later reads are plain GETs.
    afterConfirm: async (id) => {
      try {
        return staffPaymentView(
          (await apiClient.post(`/payments/intents/${id}/confirm`, {})).data.data,
        );
      } catch (error) {
        // 400 = already settled or failed meanwhile (e.g. by the webhook): read the truth.
        if ((error as any)?.response?.status === 400) {
          return staffPaymentView((await apiClient.get(`/payments/${id}`)).data.data);
        }
        throw error;
      }
    },
  };
}
