import { ConflictException } from '@nestjs/common';

/*
 * Hotel workflow rules. The server is authoritative; the web client mirrors
 * HOTEL_BOOKING_TRANSITIONS (apps/web/tests/server-contracts.test.ts compares
 * the two tables) so it only ever offers a move the server will accept.
 */

/** Direct hotel booking lifecycle: which status may follow which. */
export const HOTEL_BOOKING_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** A booking is recorded as a request or an already-confirmed reservation; later stages happen at the desk. */
export const HOTEL_BOOKING_INITIAL_STATUSES = ['PENDING', 'CONFIRMED'];

/** Closed bookings keep their history: only the notes may still change. */
export const HOTEL_BOOKING_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

/** Bookings that hold their room for the stay (used for double-booking checks). */
export const ROOM_HOLDING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

/**
 * Room statuses a manager may set by hand. OCCUPIED is never typed in: it
 * follows check-in and check-out so the room board cannot contradict the
 * bookings.
 */
export const ROOM_MANUAL_STATUSES = ['AVAILABLE', 'MAINTENANCE', 'INACTIVE'];

export function assertHotelBookingTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = HOTEL_BOOKING_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictException(
      allowed.length
        ? `A ${from} booking can move to ${allowed.join(' or ')}, not ${to}`
        : `A ${from} booking is closed and cannot change status`,
    );
  }
}

/** Two stays overlap when each starts before the other ends (check-out day is free again). */
export function staysOverlap(aIn: Date, aOut: Date, bIn: Date, bOut: Date): boolean {
  return aIn < bOut && bIn < aOut;
}
