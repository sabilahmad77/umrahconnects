import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAllOwned, assertOwnedIfPresent, findOwned, requireId } from '../../common/tenant-scope';
import {
  CreateVehicleDto, UpdateVehicleDto, CreateDriverDto, UpdateDriverDto, CreateRouteDto, UpdateRouteDto,
  CreateAssignmentDto, UpdateAssignmentDto, CreateTasreehDto, QueryTransportDto,
} from './dto/transport.dto';

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

const ACTIVE_ASSIGNMENT = (status: string) => status !== 'CANCELLED';

const serializeBigInt = <T extends Record<string, any>>(o: T): T => {
  const out: any = { ...o };
  for (const k of Object.keys(out)) {
    if (typeof out[k] === 'bigint') out[k] = Number(out[k]);
  }
  return out;
};

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
          _count: { select: { assignments: true, routes: true } },
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
      assignments: vehicle.assignments.map((a: any) => serializeBigInt(scrubForeign(a, tenantId, ['route', 'driver']))),
      routes: vehicle.routes.map((r: any) => serializeBigInt(r)),
    };
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({
      data: {
        tenantId,
        type: normalizeVehicleType(dto.type) as any,
        name: dto.name,
        brand: dto.brand ?? dto.make,
        plateNumber: dto.plateNumber,
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

  async updateVehicle(tenantId: string, id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.findVehicleById(tenantId, id);
    const data: any = {};
    for (const k of ['name', 'brand', 'registrationNumber', 'luggageCapacity', 'hasAc', 'model', 'year', 'features', 'imageUrls', 'documentUrls', 'status', 'isActive', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.make !== undefined && dto.brand === undefined) data.brand = dto.make;
    if (dto.plateNumber) data.plateNumber = dto.plateNumber;
    if (dto.type !== undefined) data.type = normalizeVehicleType(dto.type);
    if (dto.capacity !== undefined) {
      if (dto.capacity < vehicle.bookedSeats) {
        throw new BadRequestException(`capacity cannot be lower than the ${vehicle.bookedSeats} seats already booked`);
      }
      data.capacity = dto.capacity;
    }
    // bookedSeats / currentDriverId are server-owned and ignored if sent.
    return this.prisma.vehicle.update({ where: { id: vehicle.id }, data });
  }

  async deleteVehicle(tenantId: string, id: string) {
    await this.findVehicleById(tenantId, id);
    return this.prisma.vehicle.update({ where: { id }, data: { isActive: false, status: 'INACTIVE' } });
  }

  async assignDriver(tenantId: string, vehicleId: string, driverId: string, isPrimary = true) {
    await this.findVehicleById(tenantId, vehicleId);
    await this.findDriverById(tenantId, driverId);
    return this.prisma.vehicleDriver.upsert({
      where: { vehicleId_driverId: { vehicleId, driverId } },
      update: { isPrimary },
      create: { vehicleId, driverId, isPrimary },
    });
  }

  async unassignDriver(tenantId: string, vehicleId: string, driverId: string) {
    await this.findVehicleById(tenantId, vehicleId);
    requireId(driverId, 'Driver');
    await this.prisma.vehicleDriver.delete({ where: { vehicleId_driverId: { vehicleId, driverId } } }).catch(() => undefined);
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
          _count: { select: { assignments: true, routes: true } },
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
    return driver;
  }

  async createDriver(tenantId: string, dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
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
    const data: any = {};
    for (const k of ['email', 'nationality', 'idNumber', 'licenseNumber', 'languages', 'photoUrl', 'documentUrls', 'isActive', 'notes', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: a cleared form field ('') leaves the stored value unchanged.
    for (const k of ['firstName', 'lastName', 'phone'] as const) {
      if (dto[k]) data[k] = dto[k];
    }
    if (dto.licenseExpiry !== undefined) data.licenseExpiry = optionalDate(dto.licenseExpiry, 'licenseExpiry');
    return this.prisma.driver.update({ where: { id: driver.id }, data });
  }

  async deleteDriver(tenantId: string, id: string) {
    await this.findDriverById(tenantId, id);
    return this.prisma.driver.update({ where: { id }, data: { isActive: false, status: 'INACTIVE' } });
  }

  // ─── Routes ─────────────────────────────────────────────────────────
  async findRoutes(tenantId: string, query: any = {}) {
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
      assignments: route.assignments.map((a: any) => serializeBigInt(scrubForeign(a, tenantId, ['vehicle']))),
    });
  }

  async createRoute(tenantId: string, dto: CreateRouteDto) {
    await assertOwnedIfPresent(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle');
    await assertOwnedIfPresent(this.prisma.driver, dto.driverId, tenantId, 'Driver');
    const data: Prisma.TransportRouteUncheckedCreateInput = {
      tenantId,
      name: dto.name,
      movementType: dto.movementType ?? dto.type ?? 'AIRPORT_PICKUP',
      originCity: dto.originCity ?? dto.origin ?? '',
      destCity: dto.destCity ?? dto.destination ?? '',
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
    const data: any = {};
    for (const k of ['pickupPoint', 'dropoffPoint', 'distanceKm', 'durationMins', 'notes', 'currency', 'movementType', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: a cleared form field ('') leaves the stored value unchanged.
    for (const k of ['name', 'originCity', 'destCity'] as const) {
      if (dto[k]) data[k] = dto[k];
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
      if (dto.totalSeats != null && dto.totalSeats < existing.bookedSeats) {
        throw new BadRequestException(`totalSeats cannot be lower than the ${existing.bookedSeats} seats already booked`);
      }
      data.totalSeats = dto.totalSeats;
    }
    if (dto.departureAt !== undefined) data.departureAt = optionalDate(dto.departureAt, 'departureAt');
    if (dto.arrivalAt !== undefined) data.arrivalAt = optionalDate(dto.arrivalAt, 'arrivalAt');
    if (dto.pricePerSeat !== undefined || dto.pricePerSeatCents !== undefined) {
      data.pricePerSeatCents = toCents(dto.pricePerSeat, dto.pricePerSeatCents);
    }
    if (dto.pricePerVehicle !== undefined || dto.pricePerVehicleCents !== undefined) {
      data.pricePerVehicleCents = toCents(dto.pricePerVehicle, dto.pricePerVehicleCents);
    }
    // bookedSeats is server-owned (maintained by assignments) and ignored if sent.
    const route = await this.prisma.transportRoute.update({ where: { id: existing.id }, data });
    return serializeBigInt(route as any);
  }

  async deleteRoute(tenantId: string, id: string) {
    await this.findRouteById(tenantId, id);
    return this.prisma.transportRoute.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  // ─── Assignments / Bookings ─────────────────────────────────────────
  async findAssignments(tenantId: string, query: any = {}) {
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
      items: items.map((a: any) => serializeBigInt(a)),
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
    return serializeBigInt(out);
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

  /**
   * Moves seats between vehicles/routes inside a transaction. Claims are conditional on
   * remaining capacity so concurrent requests cannot overbook; releases never go below 0.
   */
  private async claimSeats(tx: Prisma.TransactionClient, tenantId: string, vehicleId: string, routeId: string | null, seats: number) {
    const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: { capacity: true } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (seats > vehicle.capacity) {
      throw new ConflictException(`Passenger count ${seats} exceeds the vehicle capacity of ${vehicle.capacity}`);
    }
    if (routeId) {
      const route = await tx.transportRoute.findFirst({ where: { id: routeId, tenantId }, select: { totalSeats: true } });
      if (!route) throw new NotFoundException('Route not found');
      const claimed = await tx.transportRoute.updateMany({
        where: { id: routeId, tenantId, ...(route.totalSeats != null ? { bookedSeats: { lte: route.totalSeats - seats } } : {}) },
        data: { bookedSeats: { increment: seats } },
      });
      if (claimed.count !== 1) throw new ConflictException('Not enough seats left on this route');
    }
    await tx.vehicle.updateMany({ where: { id: vehicleId, tenantId }, data: { bookedSeats: { increment: seats } } });
  }

  private async releaseSeats(tx: Prisma.TransactionClient, tenantId: string, vehicleId: string, routeId: string | null, seats: number) {
    if (routeId) {
      await tx.transportRoute.updateMany({ where: { id: routeId, tenantId, bookedSeats: { gte: seats } }, data: { bookedSeats: { decrement: seats } } });
    }
    await tx.vehicle.updateMany({ where: { id: vehicleId, tenantId, bookedSeats: { gte: seats } }, data: { bookedSeats: { decrement: seats } } });
  }

  async createAssignment(tenantId: string, dto: CreateAssignmentDto) {
    const vehicle = await findOwned<{ id: string }>(this.prisma.vehicle, dto.vehicleId, tenantId, 'Vehicle', {}, { id: true });
    const groupId = dto.groupId ?? dto.tripGroupId;
    await this.assertAssignmentRefs(tenantId, { routeId: dto.routeId, driverId: dto.driverId, bookingId: dto.bookingId, groupId });
    await assertAllOwned(this.prisma.pilgrim, dto.pilgrims, tenantId, 'Pilgrim');
    const scheduledAt = optionalDate(dto.scheduledAt, 'scheduledAt');
    if (!scheduledAt) throw new BadRequestException('scheduledAt is required');
    const passengerCount = dto.passengerCount ?? dto.passengers ?? 1;
    const status = dto.status ?? 'SCHEDULED';

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
      pilgrims: dto.pilgrims ?? [],
      passengerCount,
      priceCents: toCents(dto.price, dto.priceCents) ?? BigInt(0),
      currency: dto.currency ?? 'SAR',
      paymentStatus: dto.paymentStatus ?? 'UNPAID',
      status,
      notes: dto.notes,
    };

    const assignment = await this.prisma.$transaction(async (tx) => {
      if (ACTIVE_ASSIGNMENT(status)) await this.claimSeats(tx, tenantId, vehicle.id, dto.routeId || null, passengerCount);
      return tx.transportAssignment.create({ data });
    });
    return serializeBigInt(assignment as any);
  }

  async updateAssignment(tenantId: string, id: string, dto: UpdateAssignmentDto) {
    const existing: any = await this.findAssignmentById(tenantId, id);
    await this.assertAssignmentRefs(tenantId, {
      vehicleId: dto.vehicleId, routeId: dto.routeId, driverId: dto.driverId, bookingId: dto.bookingId, groupId: dto.groupId,
    });
    await assertAllOwned(this.prisma.pilgrim, dto.pilgrims, tenantId, 'Pilgrim');
    const data: any = {};
    for (const k of ['customerName', 'customerPhone', 'pickupLocation', 'dropoffLocation', 'pilgrims', 'passengerCount', 'currency', 'notes', 'customerType', 'status', 'paymentStatus'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
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

    const before = {
      active: ACTIVE_ASSIGNMENT(existing.status),
      vehicleId: existing.vehicleId as string,
      routeId: (existing.routeId ?? null) as string | null,
      seats: existing.passengerCount as number,
    };
    const after = {
      active: ACTIVE_ASSIGNMENT(data.status ?? existing.status),
      vehicleId: (data.vehicleId ?? existing.vehicleId) as string,
      routeId: (data.routeId !== undefined ? data.routeId : existing.routeId ?? null) as string | null,
      seats: (data.passengerCount ?? existing.passengerCount) as number,
    };
    const seatsChanged =
      before.active !== after.active || before.vehicleId !== after.vehicleId ||
      before.routeId !== after.routeId || before.seats !== after.seats;

    const a = await this.prisma.$transaction(async (tx) => {
      if (seatsChanged) {
        if (before.active) await this.releaseSeats(tx, tenantId, before.vehicleId, before.routeId, before.seats);
        if (after.active) await this.claimSeats(tx, tenantId, after.vehicleId, after.routeId, after.seats);
      }
      return tx.transportAssignment.update({ where: { id: existing.id }, data });
    });
    return serializeBigInt(a as any);
  }

  async cancelAssignment(tenantId: string, id: string) {
    const a: any = await this.findAssignmentById(tenantId, id);
    if (a.status === 'CANCELLED') {
      const { vehicle: _v, route: _r, driver: _d, ...plain } = a;
      return plain; // already cancelled — never release the seats twice
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.releaseSeats(tx, tenantId, a.vehicleId, a.routeId ?? null, a.passengerCount ?? 1);
      return tx.transportAssignment.update({ where: { id: a.id }, data: { status: 'CANCELLED' } });
    });
    return serializeBigInt(updated as any);
  }

  // ─── Tasreeh ─────────────────────────────────────────────────────────
  async findTasreeh(tenantId: string) {
    return this.prisma.tasreehPermit.findMany({
      where: { tenantId },
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
    const [
      totalVehicles, availableVehicles, bookedVehicles, maintVehicles, inactiveVehicles,
      totalDrivers, availableDrivers, onTripDrivers,
      totalRoutes, activeRoutes, fullyBookedRoutes,
      totalAssignments, scheduledAssignments, inProgressAssignments, completedAssignments,
      upcomingAssignments, recentAssignments,
    ] = await Promise.all([
      this.prisma.vehicle.count({ where: { tenantId } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'AVAILABLE', isActive: true } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'BOOKED' } }),
      this.prisma.vehicle.count({ where: { tenantId, status: 'UNDER_MAINTENANCE' } }),
      this.prisma.vehicle.count({ where: { tenantId, OR: [{ status: 'INACTIVE' }, { isActive: false }] } }),
      this.prisma.driver.count({ where: { tenantId } }),
      this.prisma.driver.count({ where: { tenantId, status: 'AVAILABLE', isActive: true } }),
      this.prisma.driver.count({ where: { tenantId, status: 'ON_TRIP' } }),
      this.prisma.transportRoute.count({ where: { tenantId } }),
      this.prisma.transportRoute.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.transportRoute.count({ where: { tenantId, status: 'FULLY_BOOKED' } }),
      this.prisma.transportAssignment.count({ where: { tenantId } }),
      this.prisma.transportAssignment.count({ where: { tenantId, status: 'SCHEDULED' } }),
      this.prisma.transportAssignment.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      this.prisma.transportAssignment.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.transportAssignment.findMany({
        where: { tenantId, scheduledAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
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

    // Revenue from assignments
    const revenue = await this.prisma.transportAssignment.aggregate({
      where: { tenantId, paymentStatus: 'PAID' },
      _sum: { priceCents: true },
    });
    const pendingRevenue = await this.prisma.transportAssignment.aggregate({
      where: { tenantId, paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, status: { not: 'CANCELLED' } },
      _sum: { priceCents: true },
    });

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
        underMaintenance: maintVehicles,
        inactive: inactiveVehicles,
        active: totalVehicles - inactiveVehicles,
      },
      drivers: { total: totalDrivers, available: availableDrivers, onTrip: onTripDrivers, active: totalDrivers },
      routes: { total: totalRoutes, active: activeRoutes, fullyBooked: fullyBookedRoutes },
      assignments: {
        total: totalAssignments,
        scheduled: scheduledAssignments,
        inProgress: inProgressAssignments,
        completed: completedAssignments,
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
