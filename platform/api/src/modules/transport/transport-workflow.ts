import { BadRequestException, ConflictException } from '@nestjs/common';

/*
 * Transport workflow rules. The server is authoritative; the web client mirrors
 * TRANSPORT_ASSIGNMENT_TRANSITIONS (apps/web/tests/server-contracts.test.ts
 * compares the two tables) so it only offers moves the server accepts.
 */

/** Trip (assignment) lifecycle: which status may follow which. */
export const TRANSPORT_ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCHEDULED', 'CONFIRMED', 'CANCELLED'],
  SCHEDULED: ['CONFIRMED', 'IN_PROGRESS', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** A trip is planned or booked first; departure and arrival are recorded on it later. */
export const ASSIGNMENT_INITIAL_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED'];

/** Closed trips keep their history: only the notes may still change. */
export const ASSIGNMENT_TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'];

/** Trips that still need their vehicle and driver (they hold vehicle seats and block clashes). */
export const OPEN_ASSIGNMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'];

/** Status values a manager may set by hand; IN_SERVICE / ON_TRIP / FULLY_BOOKED follow the trips and seats. */
export const VEHICLE_MANUAL_STATUSES = ['AVAILABLE', 'BOOKED', 'UNDER_MAINTENANCE', 'INACTIVE'];
export const DRIVER_MANUAL_STATUSES = ['AVAILABLE', 'ASSIGNED', 'OFF_DUTY', 'INACTIVE'];
export const ROUTE_MANUAL_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'INACTIVE'];

/** Routes that sell seats. A full route stays listed so the seat check can explain why it is refused. */
export const BOOKABLE_ROUTE_STATUSES = ['ACTIVE', 'FULLY_BOOKED'];

/** How long a trip occupies its vehicle and driver when the route gives no duration. */
export const DEFAULT_TRIP_MINUTES = 60;

export function assertAssignmentTransition(from: string, to: string) {
  if (from === to) return;
  const allowed = TRANSPORT_ASSIGNMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ConflictException(
      allowed.length
        ? `A ${from} trip can move to ${allowed.join(' or ')}, not ${to}`
        : `A ${from} trip is closed and cannot change status`,
    );
  }
}

export function assertManualStatus(kind: string, status: string | undefined, allowed: string[], derivedNote: string) {
  if (status !== undefined && !allowed.includes(status)) {
    throw new BadRequestException(`A ${kind} can be set to ${allowed.join(', ')}; ${derivedNote}`);
  }
}

/** Payment state is written by the payments module only — never from a form. */
export function rejectClientPaymentStatus(paymentStatus: unknown) {
  if (paymentStatus !== undefined) {
    throw new BadRequestException(
      'paymentStatus cannot be set here; it follows the payments recorded in Finance',
    );
  }
}

/** [start, start + minutes) windows overlap. */
export function tripsOverlap(aStart: Date, aMinutes: number, bStart: Date, bMinutes: number): boolean {
  const aEnd = aStart.getTime() + aMinutes * 60_000;
  const bEnd = bStart.getTime() + bMinutes * 60_000;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}
