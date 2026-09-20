import * as bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestApp, TestContext } from './app';
import { Actor, bearer, buildWorld, PASSWORD, World } from './fixtures';

/**
 * Business workflows of hotel companies, transport companies and operators:
 * the server owns the lifecycle (allowed status moves), derived state (room
 * occupancy, seat counters, fleet status) and payment state, and refuses
 * double bookings. Every refusal is re-read from the database to prove nothing
 * changed.
 */

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('business workflows: hotels, operators and transport', () => {
  let ctx: TestContext;
  let w: World;

  beforeAll(async () => {
    ctx = await createTestApp();
    w = await buildWorld(ctx);
  });
  afterAll(async () => ctx?.close());

  const call = (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const req = ctx.http()[method](api(path)).set(bearer(a));
    return body !== undefined ? req.send(body) : req;
  };
  /** Performs a request, asserts its status and returns the payload. */
  const expectStatus = async (a: Actor, method: Method, path: string, body: Record<string, unknown> | undefined, status: number) => {
    const res = await call(a, method, path, body);
    expect(res.status, `${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? '')}`).toBe(status);
    return res.body?.data ?? res.body;
  };
  const ok = async (a: Actor, method: Method, path: string, body?: Record<string, unknown>) => {
    const res = await call(a, method, path, body);
    if (res.status >= 300) throw new Error(`${a.email} ${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return res.body?.data ?? res.body;
  };
  const errorOf = async (a: Actor, method: Method, path: string, body: Record<string, unknown> | undefined, status: number) => {
    const res = await call(a, method, path, body);
    expect(res.status, `${method.toUpperCase()} ${path} → ${res.status} ${JSON.stringify(res.body?.error ?? '')}`).toBe(status);
    const m = res.body?.error?.message;
    return Array.isArray(m) ? m.join(' ') : String(m ?? '');
  };

  // ────────────────────────────────────────────────────────────────────────
  describe('hotel manager', () => {
    let hotel: any; let rt: any; let room101: any; let room102: any; let b1: any; let b2: any;

    beforeAll(async () => {
      hotel = await ok(w.hotelA, 'post', '/hotels', { name: `Workflow Hotel ${uniq()}`, city: 'MAKKAH' });
    });

    it('hotel form: required and formatted fields are enforced', async () => {
      await expectStatus(w.hotelA, 'post', '/hotels', { city: 'MAKKAH' }, 400);
      await expectStatus(w.hotelA, 'post', '/hotels', { name: 'Bad country', country: 'Saudi' }, 400);
      await expectStatus(w.hotelA, 'post', '/hotels', { name: 'Bad time', checkInTime: '3pm' }, 400);
      await expectStatus(w.hotelA, 'put', `/hotels/${hotel.id}`, { name: '' }, 400);
      const saved = await expectStatus(w.hotelA, 'put', `/hotels/${hotel.id}`, { checkInTime: '15:00', country: 'sa' }, 200);
      expect([saved.checkInTime, saved.country]).toEqual(['15:00', 'SA']);
      const row = await ctx.prisma.hotel.findUniqueOrThrow({ where: { id: hotel.id } });
      expect(row.name).toBe(hotel.name);
    });

    it('room types keep an explicit guest count and unique names', async () => {
      rt = await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/room-types`,
        { name: 'Family Double', bedConfiguration: 'DOUBLE', maxOccupancy: 3, basePrice: 450 }, 201);
      expect(rt.occupancy).toBe(3);
      await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/room-types`, { name: 'family double' }, 409);
      expect(await ctx.prisma.roomType.count({ where: { hotelId: hotel.id } })).toBe(1);
    });

    it('rooms need a unique number and never take OCCUPIED by hand', async () => {
      await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/rooms`, { capacity: 2 }, 400);
      room101 = await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/rooms`, { roomNumber: '101', roomTypeId: rt.id, capacity: 3 }, 201);
      await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/rooms`, { roomNumber: ' 101 ' }, 409);
      await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/rooms`, { roomNumber: '103', status: 'OCCUPIED' }, 400);
      room102 = await expectStatus(w.hotelA, 'post', `/hotels/${hotel.id}/rooms`, { roomNumber: '102', capacity: 2 }, 201);
      await expectStatus(w.hotelA, 'put', `/hotels/rooms/${room102.id}`, { status: 'OCCUPIED' }, 400);
      expect(await ctx.prisma.room.count({ where: { hotelId: hotel.id } })).toBe(2);
    });

    it('bookings: a guest is required, payment state is server-owned and a room is never double-booked', async () => {
      const base = { hotelId: hotel.id, checkIn: day(5), checkOut: day(8) };
      await expectStatus(w.hotelA, 'post', '/hotels/bookings', base, 400);
      // F13: no payment is linked to hotel bookings, so a payment status is neither accepted nor shown.
      expect(await errorOf(w.hotelA, 'post', '/hotels/bookings', { ...base, guestName: 'A', paymentStatus: 'PAID' }, 400)).toMatch(/paymentStatus should not exist/);
      await expectStatus(w.hotelA, 'post', '/hotels/bookings', { ...base, guestName: 'A', status: 'CHECKED_IN' }, 400);

      b1 = await expectStatus(w.hotelA, 'post', '/hotels/bookings', { ...base, guestName: 'Guest One', roomId: room101.id, guests: 2 }, 201);
      expect([b1.status, 'paymentStatus' in b1, b1.room?.roomNumber]).toEqual(['PENDING', false, '101']);
      expect(b1.allowedTransitions).toEqual(['CONFIRMED', 'CANCELLED']);
      // A pending reservation does not make the room occupied.
      expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: room101.id } })).status).toBe('AVAILABLE');

      expect(await errorOf(w.hotelA, 'post', '/hotels/bookings',
        { hotelId: hotel.id, guestName: 'Clash', roomId: room101.id, checkIn: day(7), checkOut: day(9) }, 409)).toMatch(/already booked/);
      // The check-out day is free for the next guest.
      b2 = await expectStatus(w.hotelA, 'post', '/hotels/bookings',
        { hotelId: hotel.id, guestName: 'Guest Two', roomId: room101.id, checkIn: day(8), checkOut: day(10) }, 201);
      await expectStatus(w.hotelA, 'post', '/hotels/bookings',
        { hotelId: hotel.id, guestName: 'Too many', roomId: room102.id, guests: 3, checkIn: day(5), checkOut: day(6) }, 400);
      expect(await ctx.prisma.hotelBooking.count({ where: { hotelId: hotel.id } })).toBe(2);

      const avail = await expectStatus(w.hotelA, 'get', `/hotels/${hotel.id}/room-availability?checkIn=${day(6)}&checkOut=${day(7)}`, undefined, 200);
      const byNumber = Object.fromEntries(avail.map((r: any) => [r.roomNumber, r.available]));
      expect(byNumber).toEqual({ 101: false, 102: true });
    });

    it('bookings follow the desk workflow and drive room occupancy', async () => {
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'CHECKED_IN' }, 409);
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'CONFIRMED' }, 200);

      const noRoom = await ok(w.hotelA, 'post', '/hotels/bookings', { hotelId: hotel.id, guestName: 'No room yet', checkIn: day(20), checkOut: day(21), status: 'CONFIRMED' });
      expect(await errorOf(w.hotelA, 'put', `/hotels/bookings/${noRoom.id}`, { status: 'CHECKED_IN' }, 400)).toMatch(/room/i);

      const inHouse = await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'CHECKED_IN' }, 200);
      expect(inHouse.allowedTransitions).toEqual(['CHECKED_OUT']);
      expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: room101.id } })).status).toBe('OCCUPIED');
      await expectStatus(w.hotelA, 'put', `/hotels/rooms/${room101.id}`, { status: 'MAINTENANCE' }, 409);
      await expectStatus(w.hotelA, 'delete', `/hotels/rooms/${room101.id}`, undefined, 409);
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'CANCELLED' }, 409);

      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'CHECKED_OUT' }, 200);
      expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: room101.id } })).status).toBe('AVAILABLE');
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { status: 'COMPLETED' }, 200);
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { guestName: 'Rewritten' }, 409);
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b1.id}`, { notes: 'Late checkout settled at the desk' }, 200);
      const row = await ctx.prisma.hotelBooking.findUniqueOrThrow({ where: { id: b1.id } });
      expect([row.guestName, row.status, row.paymentStatus]).toEqual(['Guest One', 'COMPLETED', 'UNPAID']);

      // A room with a stay ahead cannot be archived; once the stay is cancelled it can.
      await expectStatus(w.hotelA, 'delete', `/hotels/rooms/${room101.id}`, undefined, 409);
      await expectStatus(w.hotelA, 'put', `/hotels/bookings/${b2.id}`, { status: 'CANCELLED' }, 200);
      await expectStatus(w.hotelA, 'delete', `/hotels/rooms/${room101.id}`, undefined, 200);
      expect((await ctx.prisma.hotel.findUniqueOrThrow({ where: { id: hotel.id } })).totalRooms).toBe(1);
    });

    it('hotel B cannot read or move hotel A\'s bookings', async () => {
      const b = await ok(w.hotelA, 'post', '/hotels/bookings', { hotelId: hotel.id, guestName: 'Private guest', roomId: room102.id, checkIn: day(30), checkOut: day(31) });
      await expectStatus(w.hotelB, 'get', `/hotels/bookings/${b.id}`, undefined, 404);
      await expectStatus(w.hotelB, 'put', `/hotels/bookings/${b.id}`, { status: 'CONFIRMED' }, 404);
      await expectStatus(w.hotelB, 'get', `/hotels/${hotel.id}/room-availability?checkIn=${day(30)}&checkOut=${day(31)}`, undefined, 404);
      const row = await ctx.prisma.hotelBooking.findUniqueOrThrow({ where: { id: b.id } });
      expect([row.status, row.guestName]).toEqual(['PENDING', 'Private guest']);
    });

    it('stats read the rooms and bookings that exist', async () => {
      const stats = await expectStatus(w.hotelA, 'get', '/hotels/stats', undefined, 200);
      expect(stats.rooms.total).toBe(await ctx.prisma.room.count({ where: { tenantId: w.tenants.hotelA, status: { not: 'INACTIVE' } } }));
      expect(stats.hotels.total).toBe(await ctx.prisma.hotel.count({ where: { tenantId: w.tenants.hotelA } }));
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('operator allotments and room assignments', () => {
    let hotel: any; let allot: any; let booking: any; let p1: any; let p2: any; let outsider: any;

    beforeAll(async () => {
      hotel = await ok(w.opA, 'post', '/hotels', { name: `Contract Hotel ${uniq()}`, city: 'MADINAH' });
      allot = await ok(w.opA, 'post', `/hotels/${hotel.id}/allotments`, { checkIn: day(30), checkOut: day(40), totalRooms: 2 });
      p1 = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Room', lastName: 'One', passportNumber: `R1${uniq()}` });
      p2 = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Room', lastName: 'Two', passportNumber: `R2${uniq()}` });
      outsider = await ok(w.opA, 'post', '/pilgrims', { firstName: 'Not', lastName: 'Booked', passportNumber: `R3${uniq()}` });
      const pkg = await ok(w.opA, 'post', '/packages', { name: `Allotment pkg ${uniq()}`, type: 'UMRAH', priceAdult: 1000 });
      booking = await ok(w.opA, 'post', '/bookings', { packageId: pkg.id, pilgrimIds: [p1.id, p2.id] });
    });

    it('staff read contracts and place their travelers; releasing needs assignment management', async () => {
      const list = await expectStatus(w.staffA, 'get', `/hotels/${hotel.id}/allotments`, undefined, 200);
      expect(list.find((a: any) => a.id === allot.id)?.availableRooms).toBe(2);
      const stay = { allotmentId: allot.id, bookingId: booking.id, checkIn: day(31), checkOut: day(33) };
      expect(await errorOf(w.staffA, 'post', `/hotels/${hotel.id}/assignments`, { ...stay, pilgrims: [p1.id, outsider.id] }, 400)).toMatch(/booking/);
      await expectStatus(w.staffA, 'post', `/hotels/${hotel.id}/assignments`, { ...stay, checkOut: day(45) }, 400);
      const asg = await expectStatus(w.staffA, 'post', `/hotels/${hotel.id}/assignments`, { ...stay, pilgrims: [p1.id, p2.id], roomNumber: '1201' }, 201);
      const assignments = await expectStatus(w.staffA, 'get', `/hotels/${hotel.id}/assignments`, undefined, 200);
      expect(assignments.find((a: any) => a.id === asg.id)?.booking?.bookingRef).toBe(booking.bookingRef);
      expect((await ctx.prisma.allotment.findUniqueOrThrow({ where: { id: allot.id } })).bookedRooms).toBe(1);

      await expectStatus(w.staffA, 'delete', `/hotels/${hotel.id}/assignments/${asg.id}`, undefined, 403);
      await expectStatus(w.staffA, 'put', `/hotels/allotments/${allot.id}`, { totalRooms: 5 }, 403);
      await expectStatus(w.opB, 'delete', `/hotels/${hotel.id}/assignments/${asg.id}`, undefined, 404);
      // Contracts are tenant-filtered: another operator sees none of them.
      expect(await expectStatus(w.opB, 'get', `/hotels/${hotel.id}/allotments`, undefined, 200)).toEqual([]);
      expect(await ctx.prisma.roomAssignment.count({ where: { id: asg.id } })).toBe(1);

      // The contract cannot shrink below what is placed; at its size it is full.
      await expectStatus(w.opA, 'put', `/hotels/allotments/${allot.id}`, { totalRooms: 1 }, 200);
      expect(await errorOf(w.staffA, 'post', `/hotels/${hotel.id}/assignments`, stay, 409)).toMatch(/fully booked/);
      await expectStatus(w.opA, 'delete', `/hotels/${hotel.id}/assignments/${asg.id}`, undefined, 200);
      expect((await ctx.prisma.allotment.findUniqueOrThrow({ where: { id: allot.id } })).bookedRooms).toBe(0);
      expect(await ctx.prisma.roomAssignment.count({ where: { id: asg.id } })).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('transport manager', () => {
    let bus: any; let van: any; let d1: any; let d2: any; let route: any; let t1: any; let t2: any; let t3: any;
    const at = new Date(Date.now() + 3 * 86_400_000);
    at.setUTCHours(10, 0, 0, 0);
    const plus = (minutes: number) => new Date(at.getTime() + minutes * 60_000).toISOString();

    beforeAll(async () => {
      bus = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'BUS', plateNumber: `BUS-${uniq()}`, capacity: 10 });
      van = await ok(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `VAN-${uniq()}`, capacity: 4 });
      d1 = await ok(w.transportA, 'post', '/transport/drivers', { firstName: 'Omar', lastName: 'One', phone: '+966500000011' });
      d2 = await ok(w.transportA, 'post', '/transport/drivers', { firstName: 'Omar', lastName: 'Two', phone: '+966500000012' });
      route = await ok(w.transportA, 'post', '/transport/routes', {
        name: `JED → MAK ${uniq()}`, originCity: 'JEDDAH', destCity: 'MAKKAH', totalSeats: 6, durationMins: 90, vehicleId: bus.id,
      });
    });

    it('fleet forms: unique plates, required cities, seats that fit the vehicle', async () => {
      await expectStatus(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: bus.plateNumber.toLowerCase(), capacity: 4 }, 409);
      await expectStatus(w.transportA, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `X-${uniq()}`, capacity: 4, status: 'IN_SERVICE' }, 400);
      await expectStatus(w.transportA, 'post', '/transport/routes', { name: 'No cities' }, 400);
      await expectStatus(w.transportA, 'post', '/transport/routes', { name: 'Too big', originCity: 'A', destCity: 'B', vehicleId: van.id, totalSeats: 8 }, 400);
      await expectStatus(w.transportA, 'put', `/transport/drivers/${d1.id}`, { firstName: '' }, 400);
      expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: d1.id } })).firstName).toBe('Omar');
      await expectStatus(w.transportA, 'get', '/transport/assignments?status=BOGUS', undefined, 400);
      await expectStatus(w.transportA, 'get', '/transport/assignments?limit=500', undefined, 400);
    });

    it('trips: payment state and seats are server-owned; availability and clashes are enforced', async () => {
      // F13: no payment is linked to trips, so a payment status is neither accepted nor shown.
      expect(await errorOf(w.transportA, 'post', '/transport/assignments', { vehicleId: bus.id, scheduledAt: plus(0), paymentStatus: 'PAID' }, 400)).toMatch(/paymentStatus should not exist/);
      await expectStatus(w.transportA, 'post', '/transport/assignments', { vehicleId: bus.id, scheduledAt: plus(0), status: 'IN_PROGRESS' }, 400);

      t1 = await expectStatus(w.transportA, 'post', '/transport/assignments',
        { vehicleId: bus.id, driverId: d1.id, routeId: route.id, scheduledAt: plus(0), passengerCount: 4, customerName: 'Group A' }, 201);
      expect([t1.status, 'paymentStatus' in t1]).toEqual(['SCHEDULED', false]);
      expect(t1.allowedTransitions).toEqual(['CONFIRMED', 'IN_PROGRESS', 'CANCELLED']);
      expect(await errorOf(w.transportA, 'post', '/transport/assignments',
        { vehicleId: bus.id, routeId: route.id, scheduledAt: plus(0), passengerCount: 3 }, 409)).toMatch(/2 seat/);
      // Passengers booked onto the same departure share it.
      t2 = await expectStatus(w.transportA, 'post', '/transport/assignments',
        { vehicleId: bus.id, routeId: route.id, scheduledAt: plus(0), passengerCount: 2, customerName: 'Group B' }, 201);
      const full = await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: route.id } });
      expect([full.bookedSeats, full.status]).toEqual([6, 'FULLY_BOOKED']);
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: bus.id } })).bookedSeats).toBe(6);

      expect(await errorOf(w.transportA, 'post', '/transport/assignments', { vehicleId: bus.id, scheduledAt: plus(30) }, 409)).toMatch(/already has a trip/);
      expect(await errorOf(w.transportA, 'post', '/transport/assignments', { vehicleId: van.id, driverId: d1.id, scheduledAt: plus(30) }, 409)).toMatch(/driver/i);
      t3 = await expectStatus(w.transportA, 'post', '/transport/assignments', { vehicleId: van.id, driverId: d2.id, scheduledAt: plus(30) }, 201);

      await expectStatus(w.transportA, 'put', `/transport/vehicles/${van.id}`, { status: 'UNDER_MAINTENANCE' }, 200);
      expect(await errorOf(w.transportA, 'post', '/transport/assignments', { vehicleId: van.id, scheduledAt: plus(5 * 24 * 60) }, 409)).toMatch(/maintenance/);
      await expectStatus(w.transportA, 'put', `/transport/vehicles/${van.id}`, { status: 'AVAILABLE' }, 200);
      await expectStatus(w.transportA, 'put', `/transport/vehicles/${bus.id}`, { capacity: 3 }, 400);
      await expectStatus(w.transportA, 'delete', `/transport/vehicles/${bus.id}`, undefined, 409);
      await expectStatus(w.transportA, 'delete', `/transport/drivers/${d1.id}`, undefined, 409);
      expect(await ctx.prisma.transportAssignment.count({ where: { vehicleId: bus.id } })).toBe(2);
    });

    it('trips follow the dispatch workflow and the fleet status follows them', async () => {
      await expectStatus(w.transportA, 'put', `/transport/assignments/${t1.id}`, { status: 'COMPLETED' }, 409);
      const started = await expectStatus(w.transportA, 'put', `/transport/assignments/${t1.id}`, { status: 'IN_PROGRESS' }, 200);
      expect(started.departedAt).toBeTruthy();
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: bus.id } })).status).toBe('IN_SERVICE');
      expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: d1.id } })).status).toBe('ON_TRIP');
      await expectStatus(w.transportA, 'put', `/transport/vehicles/${bus.id}`, { status: 'UNDER_MAINTENANCE' }, 409);
      await expectStatus(w.transportA, 'put', `/transport/drivers/${d2.id}`, { status: 'ON_TRIP' }, 400);
      await expectStatus(w.transportA, 'post', `/transport/assignments/${t1.id}/cancel`, undefined, 409);

      const done = await expectStatus(w.transportA, 'put', `/transport/assignments/${t1.id}`, { status: 'COMPLETED' }, 200);
      expect(done.arrivedAt).toBeTruthy();
      const busRow = await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: bus.id } });
      expect([busRow.status, busRow.bookedSeats]).toEqual(['AVAILABLE', 2]);
      expect((await ctx.prisma.driver.findUniqueOrThrow({ where: { id: d1.id } })).status).toBe('AVAILABLE');
      // Seats sold on the route stay sold after the trip.
      expect((await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: route.id } })).bookedSeats).toBe(6);
      await expectStatus(w.transportA, 'put', `/transport/assignments/${t1.id}`, { passengerCount: 1 }, 409);
      await expectStatus(w.transportA, 'put', `/transport/assignments/${t1.id}`, { notes: 'Arrived on time' }, 200);

      // Cancelling twice is idempotent: the seats are released once.
      await expectStatus(w.transportA, 'post', `/transport/assignments/${t2.id}/cancel`, undefined, 201);
      await expectStatus(w.transportA, 'post', `/transport/assignments/${t2.id}/cancel`, undefined, 201);
      const reopened = await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: route.id } });
      expect([reopened.bookedSeats, reopened.status]).toEqual([4, 'ACTIVE']);
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: bus.id } })).bookedSeats).toBe(0);
      await expectStatus(w.transportA, 'put', `/transport/routes/${route.id}`, { bookedSeats: 0, status: 'FULLY_BOOKED' }, 400);
      expect((await ctx.prisma.transportRoute.findUniqueOrThrow({ where: { id: route.id } })).bookedSeats).toBe(4);
    });

    it('transport B cannot move transport A\'s trips', async () => {
      await expectStatus(w.transportB, 'post', `/transport/assignments/${t3.id}/cancel`, undefined, 404);
      await expectStatus(w.transportB, 'put', `/transport/assignments/${t3.id}`, { status: 'CONFIRMED' }, 404);
      const row = await ctx.prisma.transportAssignment.findUniqueOrThrow({ where: { id: t3.id } });
      expect(row.status).toBe('SCHEDULED');
      expect((await ctx.prisma.vehicle.findUniqueOrThrow({ where: { id: van.id } })).bookedSeats).toBe(1);
    });

    it('F16: transport:vehicle:read alone views trips (as the catalogue says) but cannot book, change or cancel them', async () => {
      // A custom organization role holding only the read capability ("View vehicles, drivers, routes and trips").
      const read = await ctx.prisma.permission.findFirstOrThrow({ where: { namespace: 'transport', resource: 'vehicle', action: 'read' } });
      const role = await ctx.prisma.role.create({
        data: { tenantId: w.tenants.transportA, name: `Dispatch viewer ${uniq()}`, permissions: { create: { permissionId: read.id } } },
      });
      const email = `viewer.${uniq()}@transport-a.test`;
      const u = await ctx.prisma.user.create({
        data: { tenantId: w.tenants.transportA, email, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: 'Viewer', lastName: 'Fixture', status: 'ACTIVE', emailVerifiedAt: new Date() },
      });
      await ctx.prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
      const login = await ctx.http().post(api('/auth/login')).send({ email, password: PASSWORD });
      expect(login.status).toBe(200);
      const viewer: Actor = { id: u.id, email, tenantId: w.tenants.transportA, token: login.body.data.accessToken, refreshToken: login.body.data.refreshToken };

      const list = await expectStatus(viewer, 'get', '/transport/assignments?limit=100', undefined, 200);
      expect(JSON.stringify(list)).toContain(t3.id);
      expect((await expectStatus(viewer, 'get', `/transport/assignments/${t3.id}`, undefined, 200)).id).toBe(t3.id);
      expect(JSON.stringify(await expectStatus(viewer, 'get', '/transport/bookings?limit=100', undefined, 200))).toContain(t3.id);

      await expectStatus(viewer, 'post', '/transport/assignments', { vehicleId: van.id, scheduledAt: plus(600) }, 403);
      await expectStatus(viewer, 'post', '/transport/bookings', { vehicleId: van.id, scheduledAt: plus(600) }, 403);
      await expectStatus(viewer, 'put', `/transport/assignments/${t3.id}`, { status: 'CONFIRMED' }, 403);
      await expectStatus(viewer, 'post', `/transport/assignments/${t3.id}/cancel`, undefined, 403);
      expect((await ctx.prisma.transportAssignment.findUniqueOrThrow({ where: { id: t3.id } })).status).toBe('SCHEDULED');

      // Reading stays inside the organization, and a role without the capability still reads nothing.
      const foreignVan = await ok(w.transportB, 'post', '/transport/vehicles', { type: 'VAN', plateNumber: `VB-${uniq()}`, capacity: 4 });
      const foreignTrip = await ok(w.transportB, 'post', '/transport/assignments', { vehicleId: foreignVan.id, scheduledAt: plus(900) });
      await expectStatus(viewer, 'get', `/transport/assignments/${foreignTrip.id}`, undefined, 404);
      expect(JSON.stringify(await expectStatus(viewer, 'get', '/transport/assignments?limit=100', undefined, 200))).not.toContain(foreignTrip.id);
      await expectStatus(w.hotelA, 'get', '/transport/assignments', undefined, 403);
      await expectStatus(w.hotelA, 'get', `/transport/assignments/${t3.id}`, undefined, 403);
    });
  });
});
