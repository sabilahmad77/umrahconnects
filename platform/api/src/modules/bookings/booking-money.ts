import { Prisma } from '@prisma/client';

/**
 * Money on an operator booking is server-owned.
 *
 * `paidAmountCents` starts at the deposit recorded when the booking is created
 * and afterwards moves only with money events on payments linked to the
 * booking (a manual or card payment on its invoice, a gateway payment against
 * the booking, a refund). Nobody types a paid amount in.
 *
 * The payment-phase statuses PARTIALLY_PAID / FULLY_PAID are derived from that
 * amount the same way invoice PAID / PARTIALLY_PAID are derived from recorded
 * payments, so a booking can never be marked paid from the browser.
 */
export const PAYMENT_PHASE_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_PAID',
  'FULLY_PAID',
] as const;

/** Statuses only the server sets, from money events. */
export const DERIVED_BOOKING_STATUSES = ['PARTIALLY_PAID', 'FULLY_PAID', 'REFUNDED'] as const;

/**
 * Manual lifecycle moves (PUT /bookings/:id/status). Cancellation has its own
 * endpoint and capability; derived statuses are never offered.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['DRAFT', 'VISA_PROCESSING'],
  PARTIALLY_PAID: ['VISA_PROCESSING'],
  FULLY_PAID: ['VISA_PROCESSING', 'TRAVELING'],
  VISA_PROCESSING: ['TRAVELING'],
  TRAVELING: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** The status a booking should have once its paid amount changed. */
export function derivedBookingStatus(
  current: string,
  paidCents: bigint,
  totalCents: bigint,
  deltaCents: bigint,
): string {
  if ((PAYMENT_PHASE_STATUSES as readonly string[]).includes(current)) {
    if (totalCents > BigInt(0) && paidCents >= totalCents) return 'FULLY_PAID';
    if (paidCents > BigInt(0)) return 'PARTIALLY_PAID';
    return current === 'PARTIALLY_PAID' || current === 'FULLY_PAID' ? 'CONFIRMED' : current;
  }
  // A cancelled booking whose money has all been returned is refunded.
  if (current === 'CANCELLED' && deltaCents < BigInt(0) && paidCents <= BigInt(0))
    return 'REFUNDED';
  return current;
}

type BookingMoneyClient = Pick<Prisma.TransactionClient, 'booking'>;

/**
 * Apply one money event to a booking. Call it inside the transaction that
 * records the event so the booking can never drift from its payments.
 */
export async function adjustBookingPaid(
  db: BookingMoneyClient,
  bookingId: string,
  deltaCents: bigint,
) {
  if (deltaCents === BigInt(0)) return;
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true, paidAmountCents: true, totalAmountCents: true },
  });
  if (!booking) return;
  let paid = BigInt(booking.paidAmountCents) + deltaCents;
  if (paid < BigInt(0)) paid = BigInt(0);
  const status = derivedBookingStatus(
    String(booking.status),
    paid,
    BigInt(booking.totalAmountCents),
    deltaCents,
  );
  await db.booking.update({
    where: { id: bookingId },
    data: {
      paidAmountCents: paid,
      ...(status !== booking.status ? { status: status as any } : {}),
    },
  });
}
