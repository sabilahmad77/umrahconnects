// Mirrors BOOKING_TRANSITIONS in the marketplace service: the server refuses any
// other move, so the UI must not offer one. PAID and REFUNDED are owned by the
// payments module, so they are never a provider-selectable target.
// tests/server-contracts.test.ts compares this literal with the service's.
export const BOOKING_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  PAID: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Transitions a provider may request from `status`; unknown states allow none. */
export function bookingTransitions(status: string): string[] {
  return BOOKING_TRANSITIONS[String(status).toUpperCase()] ?? [];
}
