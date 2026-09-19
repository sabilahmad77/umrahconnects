import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAllOwned, assertOwnedIfPresent, findOwned, requireId } from '../../common/tenant-scope';
import {
  CreateVehicleDto, UpdateVehicleDto, CreateDriverDto, UpdateDriverDto, CreateRouteDto, UpdateRouteDto,
  CreateAssignmentDto, UpdateAssignmentDto, CreateTasreehDto, QueryAssignmentsDto, QueryRoutesDto, QueryTransportDto,
} from './dto/transport.dto';
import {
  ASSIGNMENT_INITIAL_STATUSES, ASSIGNMENT_TERMINAL_STATUSES, BOOKABLE_ROUTE_STATUSES,
  DRIVER_MANUAL_STATUSES, OPEN_ASSIGNMENT_STATUSES, ROUTE_MANUAL_STATUSES, TRANSPORT_ASSIGNMENT_TRANSITIONS,
  VEHICLE_MANUAL_STATUSES, assertAssignmentTransition, assertManualStatus, checkTrip, recountSeats,
  rejectClientPaymentStatus, seatsSold, type Trip,
} from './transport-workflow';

type Tx = Prisma.TransactionClient;

// Prisma TransportType enum + common client aliases. Unknown values → 400, not 500.
const VEHICLE_TYPES = ['BUS_SMALL', 'BUS_MEDIUM', 'BUS_LARGE', 'PRIVATE_CAR', 'VAN'] as const;
const VEHICLE_TYPE_ALIASES: Record<string, string> = {
  BUS: 'BUS_LARGE', COACH: 'BUS_LARGE', MINIBUS: 'BUS_SMALL', COASTER: 'BUS_SMALL',
  HIACE: 'BUS_SMALL', CAR: 'PRIVATE_CAR', SEDAN: 'PRIVATE_CAR', SUV: 'PRIVATE_CAR',
};
function normalizeVehicleType(raw?: string): string {
  const v = (raw ?? '').toUpperCase().trim();
  if ((VEHICLE_TYPES as readonly string[]).includes(v)) return v;
  if (VEHICLE_TYPE_ALIASES[v]) return VEHICLE_TYPE_ALIASES[v];
  throw new BadRequestException(
    `Invalid vehicle type '${raw}'. Allowed: ${VEHICLE_TYPES.join(', ')} (aliases: ${Object.keys(VEHICLE_TYPE_ALIASES).join(', ')})`,
  );
}

/** Money in: explicit cents win, else major units ×100. null clears; undefined = not provided. */
function toCents(major?: number | null, cents?: number | null): bigint | null | undefined {
  if (cents != null) return BigInt(Math.round(cents));
  if (major != null) return BigInt(Math.round(major * 100));
  if (cents === null || major === null) return null;
  return undefined;
}

/** Parses an optional date field: '' / null clear it, an unparsable value is a 400. */
function optionalDate(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new BadRequestException(`${field} must be a valid date`);
  return d;
}

/** Drops a to-one relation that (through legacy data) points at another tenant's row. */
function scrubForeign<T extends Record<string, any>>(row: T, tenantId: string, keys: string[]): T {
  const out: any = { ...row };
  for (const k of keys) if (out[k] && out[k].tenantId !== tenantId) out[k] = null;
  return out;
}

const serializeBigInt = <T extends Record<string, any>>(o: T): T => {
  const out: any = { ...o };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'bigint') out[k] = Number(out[k]);
  }
  return out;
};

/** Every trip carries the moves the server will accept next, so the UI never offers a dead end. */
const serializeAssignment = (a: any) => ({
  ...serializeBigInt(a),
  allowedTransitions: TRANSPORT_ASSIGNMENT_TRANSITIONS[a.status] ?? [],
});

const sameText = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter(Boolean))] as string[];
const OPEN = { in: OPEN_ASSIGNMENT_STATUSES };

@Injectable()
export class TransportService {
  constructor(private prisma: PrismaService) {}

  // ─── Vehicles ─────────────────────────────────────────────────────────
  async findVehicles(tenantId: string, query: QueryTransportDto) {
    const { type, status, search, page = 1, limit = 20 } = query as any;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) where.OR = [
      { plateNumber: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { model: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
    ];
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          drivers: { include: { driver: { select: { id: true, firstName: true, lastName: true, phone: true } } }, take: 3 },
          _count: { select: { assignments: { where: { status: OPEN } }, routes: true } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findVehicleById(tenantId: string, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: requireId(id, 'Vehicle'), tenantId },
      include: {
        drivers: { where: { driver: { tenantId } }, include: { driver: true } },
        assignments: { where: { tenantId }, orderBy: { scheduledAt: 'desc' }, take: 10, include: { route: true, driver: true } },
        routes: { where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 },
        tasreehPermits: { where: { tenantId }, orderBy: { permitDate: 'desc' }, take: 5 },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return {
      ...vehicle,
      assignments: vehicle.assignments.map((a: any) => serializeAssignment(scrubForeign(a, tenantId, ['route', 'driver']))),
      routes: vehicle.routes.map((r: any) => serializeBigInt(r)),
    };
  }

  private async assertPlateFree(tenantId: string, plate: string, exceptId?: string) {
    const clash = await this.prisma.vehicle.findFirst({
      where: { tenantId, plateNumber: { equals: plate.trim(), mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A vehicle with plate ${plate.trim()} is already registered`);
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    assertManualStatus('vehicle', dto.status, VEHICLE_MANUAL_STATUSES, 'IN_SERVICE follows trips in progress');
    const plateNumber = dto.plateNumber.trim();
    await this.assertPlateFree(tenantId, plateNumber);
    return this.prisma.vehicle.create({
      data: {
        tenantId,
        type: normalizeVehicleType(dto.type) as any,
        name: dto.name,
        brand: dto.brand ?? dto.make,
        plateNumber,
        registrationNumber: dto.registrationNumber,
        capacity: dto.capacity,
        luggageCapacity: dto.luggageCapacity,
        hasAc: dto.hasAc ?? true,
        model: dto.model,
        year: dto.year,
        features: dto.features ?? dto.amenities ?? [],
        imageUrls: dto.imageUrls ?? [],
        documentUrls: dto.documentUrls ?? [],
        licensedForHajj: dto.licensedForHajj ?? false,
        saudiLicenseNo: dto.saudiLicenseNo,
        status: dto.status ?? 'AVAILABLE',
        isActive: true,
        notes: dto.notes,
      },
    });
  }

  /** Open trips that still need this vehicle or driver (they block archiving). */
  private openTrips(tenantId: string, where: Prisma.TransportAssignmentWhereInput) {
    return this.prisma.transportAssignment.count({ where: { ...where, tenantId, status: OPEN } });
  }

  async updateVehicle(tenantId: string, id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.findVehicleById(tenantId, id);
    assertManualStatus('vehicle', dto.status, VEHICLE_MANUAL_STATUSES, 'IN_SERVICE follows trips in progress');
    const data: any = {};
    for (const k of ['name', 'brand', 'registrationNumber', 'luggageCapacity', 'hasAc', 'model', 'year', 'features', 'imageUrls', 'documentUrls', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.make !== undefined && dto.brand === undefined) data.brand = dto.make;
    if (dto.plateNumber !== undefined) {
      const plate = dto.plateNumber.trim();
      if (!plate) throw new BadRequestException('plateNumber must not be empty');
      if (!sameText(plate, vehicle.plateNumber)) await this.assertPlateFree(tenantId, plate, vehicle.id);
      data.plateNumber = plate;
    }
    if (dto.type !== undefined) data.type = normalizeVehicleType(dto.type);
    const statusChanges = dto.status !== undefined && dto.status !== vehicle.status;
    const retiring = (statusChanges && dto.status === 'INACTIVE') || (dto.isActive === false && vehicle.isActive);
    if ((statusChanges || dto.isActive === false) && vehicle.status === 'IN_SERVICE') {
      throw new ConflictException('This vehicle is on a trip in progress; complete the trip first');
    }
    if (retiring) {
      const open = await this.openTrips(tenantId, { vehicleId: vehicle.id });
      if (open > 0) throw new ConflictException(`This vehicle has ${open} open trip(s); reassign or cancel them before archiving it`);
    }
    if (statusChanges) data.status = dto.status;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.capacity !== undefined && dto.capacity !== vehicle.capacity) {
      const largest = await this.prisma.transportAssignment.aggregate({
        where: { tenantId, vehicleId: vehicle.id, status: OPEN }, _max: { passengerCount: true },
      });
      const needed = largest._max.passengerCount ?? 0;
      if (dto.capacity < needed) {
        throw new BadRequestException(`capacity cannot be lower than the ${needed} passengers on an open trip of this vehicle`);
      }
      data.capacity = dto.capacity;
    }
    // bookedSeats / currentDriverId are server-owned and not accepted.
    return this.prisma.vehicle.update({ where: { id: vehicle.id }, data });
  }

  /** Archive: the vehicle leaves the active fleet; its trip history stays. */
  async deleteVehicle(tenantId: string, id: string) {
    const vehicle = await this.findVehicleById(tenantId, id);
    if (vehicle.status === 'IN_SERVICE') throw new ConflictException('This vehicle is on a trip in progress; complete the trip first');
    const open = await this.openTrips(tenantId, { vehicleId: vehicle.id });
    if (open > 0) throw new ConflictException(`This vehicle has ${open} open trip(s); reassign or cancel them before archiving it`);
    return this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { isActive: false, status: 'INACTIVE' } });
  }

  async assignDriver(tenantId: string, vehicleId: string, driverId: string, isPrimary = true) {
    const vehicle = await this.findVehicleById(tenantId, vehicleId);
    if (!vehicle.isActive || vehicle.status === 'INACTIVE') throw new ConflictException('This vehicle is archived');
    const driver = await this.findDriverById(tenantId, driverId);
    if (!driver.isActive || driver.status === 'INACTIVE') throw new ConflictException('This driver is archived');
    return this.prisma.$transaction(async (tx) => {
      // One primary driver per vehicle: promoting a driver demotes the previous one.
      if (isPrimary) {
        await tx.vehicleDriver.updateMany({ where: { vehicleId: vehicle.id, driverId: { not: driver.id } }, data: { isPrimary: false } });
      }
      return tx.vehicleDriver.upsert({
        where: { vehicleId_driverId: { vehicleId: vehicle.id, driverId: driver.id } },
        update: { isPrimary },
        create: { vehicleId: vehicle.id, driverId: driver.id, isPrimary },
      });
    });
  }

  async unassignDriver(tenantId: string, vehicleId: string, driverId: string) {
    const vehicle = await this.findVehicleById(tenantId, vehicleId);
    requireId(driverId, 'Driver');
    await this.prisma.vehicleDriver.deleteMany({ where: { vehicleId: vehicle.id, driverId } });
    return { success: true };
  }

  // ─── Drivers ─────────────────────────────────────────────────────────
  async findDrivers(tenantId: string, query: QueryTransportDto) {
    const { status, search, page = 1, limit = 20 } = query as any;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (search) where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { licenseNumber: { contains: search, mode: 'insensitive' } },
    ];
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          vehicles: { include: { vehicle: { select: { id: true, plateNumber: true, type: true } } } },
          _count: { select: { assignments: { where: { status: OPEN } }, routes: true } },
        },
      }),
      this.prisma.driver.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findDriverById(tenantId: string, id: string) {
    const driver = await this.prisma.driver.findFirst({
      where: { id: requireId(id, 'Driver'), tenantId },
      include: {
        vehicles: { where: { vehicle: { tenantId } }, include: { vehicle: true } },
        assignments: { where: { tenantId }, orderBy: { scheduledAt: 'desc' }, take: 10, include: { route: true, vehicle: true } },
        routes: { where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return {
      ...driver,
      assignments: driver.assignments.map((a: any) => serializeAssignment(scrubForeign(a, tenantId, ['route', 'vehicle']))),
      routes: driver.routes.map((r: any) => serializeBigInt(r)),
    };
  }

  async createDriver(tenantId: string, dto: CreateDriverDto) {
    assertManualStatus('driver', dto.status, DRIVER_MANUAL_STATUSES, 'ON_TRIP follows trips in progress');
    return this.prisma.driver.create({
      data: {
        tenantId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone.trim(),
        email: dto.email,
        nationality: dto.nationality,
        idNumber: dto.idNumber,
        licenseNumber: dto.licenseNumber,
        licenseExpiry: optionalDate(dto.licenseExpiry, 'licenseExpiry') ?? undefined,
        languages: dto.languages ?? [],
        photoUrl: dto.photoUrl,
        documentUrls: dto.documentUrls ?? [],
        status: dto.status ?? 'AVAILABLE',
        isActive: true,
        notes: dto.notes,
      },
    });
  }

  async updateDriver(tenantId: string, id: string, dto: UpdateDriverDto) {
    const driver = await this.findDriverById(tenantId, id);
    assertManualStatus('driver', dto.status, DRIVER_MANUAL_STATUSES, 'ON_TRIP follows trips in progress');
    const data: any = {};
    for (const k of ['email', 'nationality', 'idNumber', 'licenseNumber', 'languages', 'photoUrl', 'documentUrls', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: the DTO refuses empty values, so a present value is always usable.
    for (const k of ['firstName', 'lastName', 'phone'] as const) {
      if (dto[k] !== undefined) data[k] = String(dto[k]).trim();
    }
    const statusChanges = dto.status !== undefined && dto.status !== driver.status;
    if ((statusChanges || dto.isActive === false) && driver.status === 'ON_TRIP') {
      throw new ConflictException('This driver is on a trip in progress; complete the trip first');
    }
    if ((statusChanges && dto.status === 'INACTIVE') || (dto.isActive === false && driver.isActive)) {
      const open = await this.openTrips(tenantId, { driverId: driver.id });
      if (open > 0) throw new ConflictException(`This driver has ${open} open trip(s); reassign or cancel them before archiving the driver`);
    }
    if (statusChanges) data.status = dto.status;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.licenseExpiry !== undefined) data.licenseExpiry = optionalDate(dto.licenseExpiry, 'licenseExpiry');
    const updated = await this.prisma.driver.update({ where: { id: driver.id }, data });
    return updated;
  }

  /** Archive: the driver leaves the active roster; trip history stays. */
  async deleteDriver(tenantId: string, id: string) {
    const driver = await this.findDriverById(tenantId, id);
    if (driver.status === 'ON_TRIP') throw new ConflictException('This driver is on a trip in progress; complete the trip first');
    const open = await this.openTrips(tenantId, { driverId: driver.id });
    if (open > 0) throw new ConflictException(`This driver has ${open} open trip(s); reassign or cancel them before archiving the driver`);
    return this.prisma.driver.update({ where: { id: driver.id }, data: { isActive: false, status: 'INACTIVE' } });
  }

  // ─── Routes ─────────────────────────────────────────────────────────
  async findRoutes(tenantId: string, query: QueryRoutesDto = {}) {
    const { status, search, page = 1, limit = 50 } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { originCity: { contains: search, mode: 'insensitive' } },
      { destCity: { contains: search, mode: 'insensitive' } },
    ];
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.transportRoute.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          vehicle: { select: { id: true, plateNumber: true, type: true, capacity: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { assignments: true } },
        },
      }),
      this.prisma.transportRoute.count({ where }),
    ]);
    return {
      items: items.map((r: any) => serializeBigInt(r)),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async findRouteById(tenantId: string, id: string) {
    const route = await this.prisma.transportRoute.findFirst({
      where: { id: requireId(id, 'Route'), tenantId },
      include: {
        vehicle: true,
        driver: true,
        assignments: { where: { tenantId }, orderBy: { scheduledAt: 'desc' }, take: 20, include: { vehicle: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return serializeBigInt({
      ...scrubForeign(route as any, tenantId, ['vehicle', 'driver']),
      assignments: route.assignments.map((a: any) => serializeAssignment(scrubForeign(a, tenantId, ['vehicle']))),
    });
  }

  /** Seats a route can sell must fit the vehicle that runs it. */
  private async assertSeatsFitVehicle(tenantId: string, vehicleId: string | null | undefined, totalSeats: number | null | undefined) {
    if (!vehicleId || totalSeats == null) return;
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { capacity: true, plateNumber: true } });
    if (vehicle && totalSeats > vehicle.capacity) {
      throw new BadRequestException(`totalSeats (${totalSeats}) cannot exceed the ${vehicle.capacity} seats of vehicle ${vehicle.plateNumber}`);
    }
  }

  async createRoute(tenantId: string, dto: CreateRouteDto) {
    assertManualStatus('route', dto.status, ROUTE_MANUAL_STATUSES, 'FULLY_BOOKED follows the seats sold');
    const originCity = (dto.originCity ?? dto.origin ?? '').trim();
    const destCity = (dto.destCity ?? dto.destination ?? '').trim();
    if (!originCity || !destCity) throw new BadRequestException('originCity and destCity are required');
    await assertOwnedIfPresent(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle');
    await assertOwnedIfPresent(this.prisma.driver, dto.driverId, tenantId, 'Driver');
    await this.assertSeatsFitVehicle(tenantId, dto.vehicleId, dto.totalSeats);
    const data: Prisma.TransportRouteUncheckedCreateInput = {
      tenantId,
      name: dto.name.trim(),
      movementType: dto.movementType ?? dto.type ?? 'AIRPORT_PICKUP',
      originCity,
      destCity,
      pickupPoint: dto.pickupPoint || undefined,
      dropoffPoint: dto.dropoffPoint || undefined,
      distanceKm: dto.distanceKm ?? undefined,
      durationMins: dto.durationMins ?? dto.estimatedDuration ?? undefined,
      departureAt: optionalDate(dto.departureAt, 'departureAt') ?? undefined,
      arrivalAt: optionalDate(dto.arrivalAt, 'arrivalAt') ?? undefined,
      currency: dto.currency ?? 'SAR',
      totalSeats: dto.totalSeats ?? undefined,
      bookedSeats: 0,
      status: dto.status ?? 'ACTIVE',
      vehicleId: dto.vehicleId || undefined,
      driverId: dto.driverId || undefined,
      notes: dto.notes,
      pricePerSeatCents: toCents(dto.pricePerSeat ?? dto.pricePerPax, dto.pricePerSeatCents) ?? undefined,
      pricePerVehicleCents: toCents(dto.pricePerVehicle, dto.pricePerVehicleCents) ?? undefined,
    };
    if (data.departureAt && data.arrivalAt && (data.arrivalAt as Date) < (data.departureAt as Date)) {
      throw new BadRequestException('arrivalAt must be after departureAt');
    }
    const route = await this.prisma.transportRoute.create({ data });
    return serializeBigInt(route as any);
  }

  async updateRoute(tenantId: string, id: string, dto: UpdateRouteDto) {
    const existing = await this.findRouteById(tenantId, id);
    // FULLY_BOOKED is derived; echoing the current value back from an edit form is harmless.
    const requested = dto.status === 'FULLY_BOOKED' && existing.status === 'FULLY_BOOKED' ? undefined : dto.status;
    assertManualStatus('route', requested, ROUTE_MANUAL_STATUSES, 'FULLY_BOOKED follows the seats sold');
    const data: any = {};
    for (const k of ['pickupPoint', 'dropoffPoint', 'distanceKm', 'durationMins', 'notes', 'currency', 'movementType'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: the DTO refuses empty values, so a present value is always usable.
    for (const k of ['name', 'originCity', 'destCity'] as const) {
      if (dto[k] !== undefined) data[k] = String(dto[k]).trim();
    }
    if (requested !== undefined && requested !== existing.status) {
      if (['CANCELLED', 'INACTIVE', 'COMPLETED'].includes(requested)) {
        const open = await this.openTrips(tenantId, { routeId: existing.id });
        if (open > 0) throw new ConflictException(`This route has ${open} open trip(s); complete or cancel them first`);
      }
      data.status = requested;
    }
    if (dto.vehicleId !== undefined) {
      await assertOwnedIfPresent(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle');
      data.vehicleId = dto.vehicleId || null;
    }
    if (dto.driverId !== undefined) {
      await assertOwnedIfPresent(this.prisma.driver, dto.driverId, tenantId, 'Driver');
      data.driverId = dto.driverId || null;
    }
    if (dto.totalSeats !== undefined) {
      const sold = await seatsSold(this.prisma, tenantId, existing.id);
      if (dto.totalSeats != null && dto.totalSeats < sold) {
        throw new BadRequestException(`totalSeats cannot be lower than the ${sold} seats already sold`);
      }
      data.totalSeats = dto.totalSeats;
    }
    await this.assertSeatsFitVehicle(
      tenantId,
      data.vehicleId !== undefined ? data.vehicleId : existing.vehicleId,
      data.totalSeats !== undefined ? data.totalSeats : existing.totalSeats,
    );
    if (dto.departureAt !== undefined) data.departureAt = optionalDate(dto.departureAt, 'departureAt');
    if (dto.arrivalAt !== undefined) data.arrivalAt = optionalDate(dto.arrivalAt, 'arrivalAt');
    const departure = data.departureAt !== undefined ? data.departureAt : existing.departureAt;
    const arrival = data.arrivalAt !== undefined ? data.arrivalAt : existing.arrivalAt;
    if (departure && arrival && new Date(arrival) < new Date(departure)) {
      throw new BadRequestException('arrivalAt must be after departureAt');
    }
    if (dto.pricePerSeat !== undefined || dto.pricePerSeatCents !== undefined) {
      data.pricePerSeatCents = toCents(dto.pricePerSeat, dto.pricePerSeatCents);
    }
    if (dto.pricePerVehicle !== undefined || dto.pricePerVehicleCents !== undefined) {
      data.pricePerVehicleCents = toCents(dto.pricePerVehicle, dto.pricePerVehicleCents);
    }
    // bookedSeats is server-owned (maintained from the trips) and ignored if sent.
    await this.prisma.$transaction(async (tx) => {
      await tx.transportRoute.update({ where: { id: existing.id }, data });
      await recountSeats(tx, tenantId, [], [existing.id]);
    });
    return this.findRouteById(tenantId, existing.id);
  }

  /** Archive: the route stops selling seats; its trips stay on record. */
  async deleteRoute(tenantId: string, id: string) {
    const route = await this.findRouteById(tenantId, id);
    const open = await this.openTrips(tenantId, { routeId: route.id });
    if (open > 0) throw new ConflictException(`This route has ${open} open trip(s); complete or cancel them first`);
    return serializeBigInt(await this.prisma.transportRoute.update({ where: { id: route.id }, data: { status: 'INACTIVE' } }) as any);
  }

  // ─── Seat and fleet state (server-owned) ─────────────────────────────
  /** Vehicle IN_SERVICE / driver ON_TRIP exactly while one of their trips is in progress. */
  private async syncFleetStatus(tx: Tx, tenantId: string, vehicleIds: (string | null | undefined)[], driverIds: (string | null | undefined)[]) {
    for (const vehicleId of unique(vehicleIds)) {
      const [moving, v] = await Promise.all([
        tx.transportAssignment.count({ where: { tenantId, vehicleId, status: 'IN_PROGRESS' } }),
        tx.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { status: true } }),
      ]);
      if (!v) continue;
      if (moving > 0 && ['AVAILABLE', 'BOOKED'].includes(v.status)) {
        await tx.vehicle.updateMany({ where: { id: vehicleId, tenantId }, data: { status: 'IN_SERVICE' } });
      } else if (moving === 0 && v.status === 'IN_SERVICE') {
        await tx.vehicle.updateMany({ where: { id: vehicleId, tenantId }, data: { status: 'AVAILABLE' } });
      }
    }
    for (const driverId of unique(driverIds)) {
      const [moving, d] = await Promise.all([
        tx.transportAssignment.count({ where: { tenantId, driverId, status: 'IN_PROGRESS' } }),
        tx.driver.findFirst({ where: { id: driverId, tenantId }, select: { status: true } }),
      ]);
      if (!d) continue;
      if (moving > 0 && ['AVAILABLE', 'ASSIGNED'].includes(d.status)) {
        await tx.driver.updateMany({ where: { id: driverId, tenantId }, data: { status: 'ON_TRIP' } });
      } else if (moving === 0 && d.status === 'ON_TRIP') {
        await tx.driver.updateMany({ where: { id: driverId, tenantId }, data: { status: 'AVAILABLE' } });
      }
    }
  }

  // ─── Assignments / Bookings ─────────────────────────────────────────
  async findAssignments(tenantId: string, query: QueryAssignmentsDto = {}) {
    const { status, search, vehicleId, driverId, routeId, page = 1, limit = 50 } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (vehicleId) where.vehicleId = vehicleId;
    if (driverId) where.driverId = driverId;
    if (routeId) where.routeId = routeId;
    if (search) where.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search, mode: 'insensitive' } },
    ];
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.transportAssignment.findMany({
        where, skip, take: +limit, orderBy: { scheduledAt: 'desc' },
        include: {
          vehicle: { select: { id: true, plateNumber: true, type: true, capacity: true } },
          route: { select: { id: true, name: true, movementType: true, originCity: true, destCity: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.transportAssignment.count({ where }),
    ]);
    return {
      items: items.map(serializeAssignment),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async findAssignmentById(tenantId: string, id: string) {
    const a = await this.prisma.transportAssignment.findFirst({
      where: { id: requireId(id, 'Assignment'), tenantId },
      include: { vehicle: true, route: true, driver: true },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    const out: any = scrubForeign(a as any, tenantId, ['vehicle', 'route', 'driver']);
    if (out.route) out.route = serializeBigInt(out.route);
    return serializeAssignment(out);
  }

  /** Validates every foreign id an assignment may reference against the caller's tenant. */
  private async assertAssignmentRefs(
    tenantId: string,
    refs: { vehicleId?: string | null; routeId?: string | null; driverId?: string | null; bookingId?: string | null; groupId?: string | null },
  ) {
    await assertOwnedIfPresent(this.prisma.vehicle, refs.vehicleId, tenantId, 'Vehicle');
    await assertOwnedIfPresent(this.prisma.transportRoute, refs.routeId, tenantId, 'Route');
    await assertOwnedIfPresent(this.prisma.driver, refs.driverId, tenantId, 'Driver');
    await assertOwnedIfPresent(this.prisma.booking, refs.bookingId, tenantId, 'Booking');
    await assertOwnedIfPresent(this.prisma.tripGroup, refs.groupId, tenantId, 'Group');
  }

  async createAssignment(tenantId: string, dto: CreateAssignmentDto) {
    rejectClientPaymentStatus(dto.paymentStatus);
    const status = dto.status ?? 'SCHEDULED';
    if (!ASSIGNMENT_INITIAL_STATUSES.includes(status)) {
      throw new BadRequestException(`A new trip starts as ${ASSIGNMENT_INITIAL_STATUSES.join(', ')}; departure and arrival are recorded on the trip`);
    }
    const vehicle = await findOwned<{ id: string }>(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle', {}, { id: true });
    const groupId = dto.groupId ?? dto.tripGroupId;
    await this.assertAssignmentRefs(tenantId, { routeId: dto.routeId, driverId: dto.driverId, bookingId: dto.bookingId, groupId });
    await assertAllOwned(this.prisma.pilgrim, dto.pilgrims, tenantId, 'Pilgrim');
    const scheduledAt = optionalDate(dto.scheduledAt, 'scheduledAt');
    if (!scheduledAt) throw new BadRequestException('scheduledAt is required');
    const passengerCount = dto.passengerCount ?? dto.passengers ?? 1;
    const pilgrims = [...new Set(dto.pilgrims ?? [])];
    if (pilgrims.length > passengerCount) {
      throw new BadRequestException(`${pilgrims.length} pilgrims were listed for ${passengerCount} passenger(s)`);
    }

    const data: Prisma.TransportAssignmentUncheckedCreateInput = {
      tenantId,
      vehicleId: vehicle.id,
      routeId: dto.routeId || undefined,
      driverId: dto.driverId || undefined,
      bookingId: dto.bookingId || undefined,
      groupId: groupId || undefined,
      customerType: dto.customerType ?? 'PLATFORM_USER',
      customerName: dto.customerName,
      customerEmail: dto.customerEmail || undefined,
      customerPhone: dto.customerPhone,
      pickupLocation: dto.pickupLocation,
      dropoffLocation: dto.dropoffLocation,
      scheduledAt,
      pilgrims,
      passengerCount,
      priceCents: toCents(dto.price, dto.priceCents) ?? BigInt(0),
      currency: dto.currency ?? 'SAR',
      // Payment state belongs to the payments module; a trip always starts unpaid.
      paymentStatus: 'UNPAID',
      status,
      notes: dto.notes,
    };

    const assignment = await this.prisma.$transaction(async (tx) => {
      await checkTrip(tx, tenantId,
        { vehicleId: vehicle.id, driverId: dto.driverId || null, routeId: dto.routeId || null, scheduledAt, seats: passengerCount },
        { vehicleChanged: true, driverChanged: true, routeChanged: true, clashes: true });
      const created = await tx.transportAssignment.create({ data });
      await recountSeats(tx, tenantId, [created.vehicleId], [created.routeId]);
      return created;
    });
    return this.findAssignmentById(tenantId, assignment.id);
  }

  async updateAssignment(tenantId: string, id: string, dto: UpdateAssignmentDto) {
    const existing: any = await this.findAssignmentById(tenantId, id);
    rejectClientPaymentStatus(dto.paymentStatus);
    if (ASSIGNMENT_TERMINAL_STATUSES.includes(existing.status)) {
      const changed = Object.entries(dto).filter(([k, v]) => v !== undefined && k !== 'notes').map(([k]) => k);
      if (changed.length) throw new ConflictException(`This trip is ${existing.status}; only its notes can still change`);
    }
    if (dto.status !== undefined) assertAssignmentTransition(existing.status, dto.status);
    await this.assertAssignmentRefs(tenantId, {
      vehicleId: dto.vehicleId, routeId: dto.routeId, driverId: dto.driverId, bookingId: dto.bookingId, groupId: dto.groupId,
    });
    await assertAllOwned(this.prisma.pilgrim, dto.pilgrims, tenantId, 'Pilgrim');

    const data: any = {};
    for (const k of ['customerName', 'customerPhone', 'pickupLocation', 'dropoffLocation', 'passengerCount', 'currency', 'notes', 'customerType'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.pilgrims !== undefined) data.pilgrims = [...new Set(dto.pilgrims)];
    if (dto.customerEmail !== undefined) data.customerEmail = dto.customerEmail || null;
    if (dto.vehicleId) data.vehicleId = dto.vehicleId; // vehicle is mandatory — cannot be cleared
    for (const k of ['routeId', 'driverId', 'bookingId', 'groupId'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k] || null;
    }
    if (dto.scheduledAt) data.scheduledAt = optionalDate(dto.scheduledAt, 'scheduledAt');
    if (dto.departedAt !== undefined) data.departedAt = optionalDate(dto.departedAt, 'departedAt');
    if (dto.arrivedAt !== undefined) data.arrivedAt = optionalDate(dto.arrivedAt, 'arrivedAt');
    if (dto.priceCents !== undefined || dto.price !== undefined) {
      data.priceCents = toCents(dto.price, dto.priceCents) ?? BigInt(0);
    }
    const nextStatus: string = dto.status ?? existing.status;
    if (dto.status !== undefined && dto.status !== existing.status) {
      data.status = dto.status;
      // Departure and arrival are stamped when the trip starts and ends unless a time was given.
      if (dto.status === 'IN_PROGRESS' && data.departedAt == null && !existing.departedAt) data.departedAt = new Date();
      if (dto.status === 'COMPLETED' && data.arrivedAt == null && !existing.arrivedAt) data.arrivedAt = new Date();
    }

    const trip: Trip = {
      vehicleId: data.vehicleId ?? existing.vehicleId,
      driverId: data.driverId !== undefined ? data.driverId : existing.driverId ?? null,
      routeId: data.routeId !== undefined ? data.routeId : existing.routeId ?? null,
      scheduledAt: data.scheduledAt ?? new Date(existing.scheduledAt),
      seats: data.passengerCount ?? existing.passengerCount,
    };
    const pilgrimCount = Array.isArray(data.pilgrims ?? existing.pilgrims) ? (data.pilgrims ?? existing.pilgrims).length : 0;
    if (pilgrimCount > trip.seats) {
      throw new BadRequestException(`${pilgrimCount} pilgrims were listed for ${trip.seats} passenger(s)`);
    }
    const vehicleChanged = trip.vehicleId !== existing.vehicleId;
    const driverChanged = !!trip.driverId && trip.driverId !== existing.driverId;
    const routeChanged = !!trip.routeId && trip.routeId !== existing.routeId;
    const scheduleChanged = trip.scheduledAt.getTime() !== new Date(existing.scheduledAt).getTime();
    const seatsChanged = trip.seats !== existing.passengerCount;
    const starting = nextStatus === 'IN_PROGRESS' && existing.status !== 'IN_PROGRESS';
    const stillOpen = OPEN_ASSIGNMENT_STATUSES.includes(nextStatus);

    await this.prisma.$transaction(async (tx) => {
      if (stillOpen && (vehicleChanged || driverChanged || routeChanged || scheduleChanged || seatsChanged || starting)) {
        await checkTrip(tx, tenantId, trip, {
          excludeId: existing.id, vehicleChanged, driverChanged, routeChanged, starting,
          clashes: vehicleChanged || driverChanged || routeChanged || scheduleChanged || seatsChanged,
        });
      }
      await tx.transportAssignment.update({ where: { id: existing.id }, data });
      await recountSeats(tx, tenantId, [existing.vehicleId, trip.vehicleId], [existing.routeId, trip.routeId]);
      await this.syncFleetStatus(tx, tenantId, [existing.vehicleId, trip.vehicleId], [existing.driverId, trip.driverId]);
    });
    return this.findAssignmentById(tenantId, existing.id);
  }

  async cancelAssignment(tenantId: string, id: string) {
    const a: any = await this.findAssignmentById(tenantId, id);
    if (a.status === 'CANCELLED') return a; // already cancelled — idempotent
    assertAssignmentTransition(a.status, 'CANCELLED');
    await this.prisma.$transaction(async (tx) => {
      await tx.transportAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
      await recountSeats(tx, tenantId, [a.vehicleId], [a.routeId]);
      await this.syncFleetStatus(tx, tenantId, [a.vehicleId], [a.driverId]);
    });
    return this.findAssignmentById(tenantId, a.id);
  }

  // ─── Tasreeh ─────────────────────────────────────────────────────────
  async findTasreeh(tenantId: string) {
    return this.prisma.tasreehPermit.findMany({
      where: { tenantId },
      orderBy: { expiresAt: 'asc' },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
    });
  }

  async createTasreeh(tenantId: string, dto: CreateTasreehDto) {
    const vehicle = await findOwned<{ id: string }>(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle', {}, { id: true });
    const permitDate = optionalDate(dto.issueDate ?? dto.permitDate, 'issueDate') ?? new Date();
    const expiresAt = optionalDate(dto.expiryDate ?? dto.expiresAt, 'expiryDate');
    if (!expiresAt) throw new BadRequestException('expiryDate is required');
    if (expiresAt < permitDate) throw new BadRequestException('expiryDate must be after issueDate');
    return this.prisma.tasreehPermit.create({
      data: {
        tenantId,
        vehicleId: vehicle.id,
        permitNumber: dto.permitNumber,
        permitDate,
        expiresAt,
        zone: dto.zone ?? dto.zones?.[0] ?? 'MAKKAH',
        documentUrl: dto.documentUrl,
      },
    });
  }

  // ─── Stats (Transport dashboard overview) ───────────────────────────
  async getStats(tenantId: string) {
    const now = new Date();
    const [
      totalVehicles, availableVehicles, bookedVehicles, inServiceVehicles, maintVehicles, inactiveVehicles,
      totalDrivers, activeDrivers, availableDrivers, onTripDrivers,
      totalRoutes, activeRoutes, fullyBookedRoutes, seatTotals,
      assignmentsByStatus, upcomingAssignments, recentAssignments,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: { tenantId } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'AVAILABLE', isActive: true } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'BOOKED', isActive: true } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'IN_SERVICE' } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'UNDER_MAINTENANCE' } }),
      this.prisma.vehicle.count({ where: { tenantId, OR: [{ status: 'INACTIVE' }, { isActive: false }] } }),
      this.prisma.driver.count({ where: { tenantId } }),
      this.prisma.driver.count({ where: { tenantId, isActive: true, status: { not: 'INACTIVE' } } }),
      this.prisma.driver.count({ where: { tenantId, status: 'AVAILABLE', isActive: true } }),
      this.prisma.driver.count({ where: { tenantId, status: 'ON_TRIP' } }),
      this.prisma.transportRoute.count({ where: { tenantId } }),
      this.prisma.transportRoute.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.transportRoute.count({ where: { tenantId, status: 'FULLY_BOOKED' } }),
      this.prisma.transportRoute.aggregate({
        where: { tenantId, status: { in: BOOKABLE_ROUTE_STATUSES }, totalSeats: { not: null } },
        _sum: { totalSeats: true, bookedSeats: true },
      }),
      this.prisma.transportAssignment.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.transportAssignment.findMany({
        where: { tenantId, scheduledAt: { gt: now }, status: { in: ['DRAFT', 'SCHEDULED', 'CONFIRMED'] } },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
        include: { vehicle: { select: { plateNumber: true } }, route: { select: { name: true } } },
      }),
      this.prisma.transportAssignment.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { vehicle: { select: { plateNumber: true } }, route: { select: { name: true } } },
      }),
    ]);
    const byStatus: Record<string, number> = Object.fromEntries(Object.keys(TRANSPORT_ASSIGNMENT_TRANSITIONS).map((s) => [s, 0]));
    assignmentsByStatus.forEach((r) => { byStatus[r.status] = r._count; });

    // Payment state is written by the payments module; these sums only read it.
    const [revenue, pendingRevenue] = await Promise.all([
      this.prisma.transportAssignment.aggregate({ where: { tenantId, paymentStatus: 'PAID' }, _sum: { priceCents: true } }),
      this.prisma.transportAssignment.aggregate({
        where: { tenantId, paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, status: { not: 'CANCELLED' } },
        _sum: { priceCents: true },
      }),
    ]);

    // Tenant marketplace listings tied to a vendor with same tenantId
    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId } });
    const listingsCount = vendor
      ? await this.prisma.listing.count({ where: { vendorId: vendor.id, isActive: true } })
      : 0;
    const openInquiries = vendor
      ? await this.prisma.listingInquiry.count({ where: { listing: { vendorId: vendor.id }, status: { in: ['NEW', 'RESPONDED'] } } })
      : 0;

    return {
      vehicles: {
        total: totalVehicles,
        available: availableVehicles,
        booked: bookedVehicles,
        inService: inServiceVehicles,
        underMaintenance: maintVehicles,
        inactive: inactiveVehicles,
        active: totalVehicles - inactiveVehicles,
      },
      drivers: { total: totalDrivers, active: activeDrivers, available: availableDrivers, onTrip: onTripDrivers },
      routes: {
        total: totalRoutes,
        active: activeRoutes,
        fullyBooked: fullyBookedRoutes,
        seatsOffered: seatTotals._sum.totalSeats ?? 0,
        seatsSold: seatTotals._sum.bookedSeats ?? 0,
      },
      assignments: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        byStatus,
        scheduled: byStatus.SCHEDULED,
        confirmed: byStatus.CONFIRMED,
        inProgress: byStatus.IN_PROGRESS,
        completed: byStatus.COMPLETED,
        cancelled: byStatus.CANCELLED,
        upcoming: upcomingAssignments.map((u: any) => serializeBigInt(u)),
        recent: recentAssignments.map((u: any) => serializeBigInt(u)),
      },
      revenue: {
        collectedCents: Number(revenue._sum.priceCents ?? 0),
        pendingCents: Number(pendingRevenue._sum.priceCents ?? 0),
        currency: 'SAR',
      },
      marketplace: { listings: listingsCount, openInquiries },
    };
  }
}
