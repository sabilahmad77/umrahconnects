import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

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

// ─── Trip availability (shared by the transport workflow and marketplace offer conversion) ───

type Tx = Prisma.TransactionClient;
type Db = Pick<Prisma.TransactionClient, 'transportAssignment'>;

const OPEN = { in: OPEN_ASSIGNMENT_STATUSES };
const when = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter(Boolean))] as string[];

/** A trip as the availability checks see it. */
export interface Trip {
  vehicleId: string;
  driverId: string | null;
  routeId: string | null;
  scheduledAt: Date;
  seats: number;
}

export async function seatsSold(db: Db, tenantId: string, routeId: string, excludeId?: string) {
  const agg = await db.transportAssignment.aggregate({
    where: { tenantId, routeId, status: { not: 'CANCELLED' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    _sum: { passengerCount: true },
  });
  return agg._sum.passengerCount ?? 0;
}

/**
 * Recomputes the counters from the trips themselves instead of adding and
 * subtracting deltas, so they self-heal from any past drift:
 *  - vehicle.bookedSeats = passengers on its open trips;
 *  - route.bookedSeats = seats sold on it (every trip that was not cancelled),
 *    and ACTIVE ↔ FULLY_BOOKED follows those seats.
 */
export async function recountSeats(tx: Tx, tenantId: string, vehicleIds: (string | null | undefined)[], routeIds: (string | null | undefined)[]) {
  for (const vehicleId of unique(vehicleIds)) {
    const agg = await tx.transportAssignment.aggregate({ where: { tenantId, vehicleId, status: OPEN }, _sum: { passengerCount: true } });
    await tx.vehicle.updateMany({ where: { id: vehicleId, tenantId }, data: { bookedSeats: agg._sum.passengerCount ?? 0 } });
  }
  for (const routeId of unique(routeIds)) {
    const sold = await seatsSold(tx, tenantId, routeId);
    const route = await tx.transportRoute.findFirst({ where: { id: routeId, tenantId }, select: { totalSeats: true, status: true } });
    if (!route) continue;
    const data: any = { bookedSeats: sold };
    if (route.totalSeats != null && route.status === 'ACTIVE' && sold >= route.totalSeats) data.status = 'FULLY_BOOKED';
    if (route.status === 'FULLY_BOOKED' && (route.totalSeats == null || sold < route.totalSeats)) data.status = 'ACTIVE';
    await tx.transportRoute.updateMany({ where: { id: routeId, tenantId }, data });
  }
}

/**
 * Availability checks for a trip, inside the write transaction (vehicle and
 * route rows are locked, so concurrent bookings cannot oversell):
 *  - the vehicle carries the passengers and is not archived / under maintenance;
 *  - the driver is active and licensed on the day;
 *  - the route is selling and has the seats left;
 *  - neither the vehicle nor the driver is already on another trip at that time.
 *    Passengers booked onto the same departure (same route, same time) share it.
 */
export async function checkTrip(
  tx: Tx, tenantId: string, trip: Trip,
  opts: { excludeId?: string; vehicleChanged: boolean; driverChanged: boolean; routeChanged: boolean; clashes: boolean; starting?: boolean },
) {
  await tx.$queryRaw`SELECT id FROM plugin_transport.vehicles WHERE id = ${trip.vehicleId}::uuid FOR UPDATE`;
  const vehicle = await tx.vehicle.findFirst({
    where: { id: trip.vehicleId, tenantId }, select: { id: true, plateNumber: true, capacity: true, status: true, isActive: true },
  });
  if (!vehicle) throw new NotFoundException('Vehicle not found');
  if (opts.vehicleChanged || opts.starting) {
    if (!vehicle.isActive || vehicle.status === 'INACTIVE') throw new ConflictException(`Vehicle ${vehicle.plateNumber} is archived`);
    if (vehicle.status === 'UNDER_MAINTENANCE') throw new ConflictException(`Vehicle ${vehicle.plateNumber} is under maintenance`);
  }
  if (trip.seats > vehicle.capacity) {
    throw new ConflictException(`Passenger count ${trip.seats} exceeds the vehicle capacity of ${vehicle.capacity}`);
  }

  if (trip.driverId) {
    const driver = await tx.driver.findFirst({
      where: { id: trip.driverId, tenantId }, select: { firstName: true, lastName: true, status: true, isActive: true, licenseExpiry: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const name = `${driver.firstName} ${driver.lastName}`.trim();
    if (opts.driverChanged || opts.starting) {
      if (!driver.isActive || driver.status === 'INACTIVE') throw new ConflictException(`Driver ${name} is archived`);
      if (driver.licenseExpiry && driver.licenseExpiry < trip.scheduledAt) {
        throw new ConflictException(`Driver ${name}'s licence expires before this trip`);
      }
    }
  }

  let tripMinutes = DEFAULT_TRIP_MINUTES;
  if (trip.routeId) {
    await tx.$queryRaw`SELECT id FROM plugin_transport.transport_routes WHERE id = ${trip.routeId}::uuid FOR UPDATE`;
    const route = await tx.transportRoute.findFirst({
      where: { id: trip.routeId, tenantId }, select: { name: true, status: true, totalSeats: true, durationMins: true },
    });
    if (!route) throw new NotFoundException('Route not found');
    if (opts.routeChanged && !BOOKABLE_ROUTE_STATUSES.includes(route.status)) {
      throw new ConflictException(`Route ${route.name} is ${route.status} and is not taking passengers`);
    }
    tripMinutes = route.durationMins || DEFAULT_TRIP_MINUTES;
    if (route.totalSeats != null) {
      const sold = await seatsSold(tx, tenantId, trip.routeId, opts.excludeId);
      if (sold + trip.seats > route.totalSeats) {
        throw new ConflictException(`Only ${Math.max(0, route.totalSeats - sold)} seat(s) left on route ${route.name}`);
      }
    }
  }

  if (!opts.clashes) return;
  const dayMs = 86_400_000;
  const others = await tx.transportAssignment.findMany({
    where: {
      tenantId,
      status: OPEN,
      ...(opts.excludeId ? { id: { not: opts.excludeId } } : {}),
      scheduledAt: { gte: new Date(trip.scheduledAt.getTime() - dayMs), lte: new Date(trip.scheduledAt.getTime() + dayMs) },
      OR: [{ vehicleId: trip.vehicleId }, ...(trip.driverId ? [{ driverId: trip.driverId }] : [])],
    },
    select: { vehicleId: true, driverId: true, routeId: true, scheduledAt: true, passengerCount: true, route: { select: { durationMins: true } } },
  });
  let sharedPassengers = 0;
  for (const o of others) {
    const sameDeparture = !!trip.routeId && o.routeId === trip.routeId && o.scheduledAt.getTime() === trip.scheduledAt.getTime();
    if (sameDeparture) {
      if (o.vehicleId === trip.vehicleId) sharedPassengers += o.passengerCount;
      continue;
    }
    if (!tripsOverlap(trip.scheduledAt, tripMinutes, o.scheduledAt, o.route?.durationMins || DEFAULT_TRIP_MINUTES)) continue;
    if (o.vehicleId === trip.vehicleId) {
      throw new ConflictException(`Vehicle ${vehicle.plateNumber} already has a trip at ${when(o.scheduledAt)}`);
    }
    if (trip.driverId && o.driverId === trip.driverId) {
      throw new ConflictException(`This driver already has a trip at ${when(o.scheduledAt)}`);
    }
  }
  if (sharedPassengers + trip.seats > vehicle.capacity) {
    throw new ConflictException(
      `Vehicle ${vehicle.plateNumber} seats ${vehicle.capacity}; this departure already carries ${sharedPassengers}`,
    );
  }
}
