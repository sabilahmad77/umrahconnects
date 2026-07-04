import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto, CreateDriverDto, CreateRouteDto, CreateAssignmentDto, CreateTasreehDto, QueryTransportDto } from './dto/transport.dto';

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
      where: { id, tenantId },
      include: {
        drivers: { include: { driver: true } },
        assignments: { orderBy: { scheduledAt: 'desc' }, take: 10, include: { route: true, driver: true } },
        routes: { orderBy: { createdAt: 'desc' }, take: 10 },
        tasreehPermits: { orderBy: { permitDate: 'desc' }, take: 5 },
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async createVehicle(tenantId: string, dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({
      data: {
        tenantId,
        type: normalizeVehicleType(dto.type) as any,
        name: (dto as any).name,
        brand: (dto as any).brand,
        plateNumber: dto.plateNumber,
        registrationNumber: (dto as any).registrationNumber,
        capacity: dto.capacity,
        luggageCapacity: (dto as any).luggageCapacity,
        hasAc: (dto as any).hasAc ?? true,
        model: dto.model,
        year: dto.year,
        features: (dto as any).features ?? (dto as any).amenities ?? [],
        imageUrls: (dto as any).imageUrls ?? [],
        documentUrls: (dto as any).documentUrls ?? [],
        licensedForHajj: (dto as any).licensedForHajj ?? false,
        status: ((dto as any).status ?? 'AVAILABLE').toUpperCase(),
        isActive: true,
        notes: (dto as any).notes,
      },
    });
  }

  async updateVehicle(tenantId: string, id: string, dto: any) {
    await this.findVehicleById(tenantId, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.plateNumber !== undefined) data.plateNumber = dto.plateNumber;
    if (dto.registrationNumber !== undefined) data.registrationNumber = dto.registrationNumber;
    if (dto.capacity !== undefined) data.capacity = dto.capacity;
    if (dto.bookedSeats !== undefined) data.bookedSeats = dto.bookedSeats;
    if (dto.luggageCapacity !== undefined) data.luggageCapacity = dto.luggageCapacity;
    if (dto.hasAc !== undefined) data.hasAc = dto.hasAc;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.features !== undefined) data.features = dto.features;
    if (dto.imageUrls !== undefined) data.imageUrls = dto.imageUrls;
    if (dto.documentUrls !== undefined) data.documentUrls = dto.documentUrls;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.vehicle.update({ where: { id }, data });
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
      where: { id, tenantId },
      include: {
        vehicles: { include: { vehicle: true } },
        assignments: { orderBy: { scheduledAt: 'desc' }, take: 10, include: { route: true, vehicle: true } },
        routes: { orderBy: { createdAt: 'desc' }, take: 10 },
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
        email: (dto as any).email,
        nationality: (dto as any).nationality,
        idNumber: (dto as any).idNumber,
        licenseNumber: (dto as any).licenseNumber,
        licenseExpiry: (dto as any).licenseExpiry ? new Date((dto as any).licenseExpiry) : undefined,
        languages: (dto as any).languages ?? [],
        photoUrl: (dto as any).photoUrl,
        documentUrls: (dto as any).documentUrls ?? [],
        status: ((dto as any).status ?? 'AVAILABLE').toUpperCase(),
        isActive: true,
        notes: (dto as any).notes,
      },
    });
  }

  async updateDriver(tenantId: string, id: string, dto: any) {
    await this.findDriverById(tenantId, id);
    const data: any = {};
    for (const k of ['firstName', 'lastName', 'phone', 'email', 'nationality', 'idNumber', 'licenseNumber', 'languages', 'photoUrl', 'documentUrls', 'isActive', 'notes']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.licenseExpiry !== undefined) data.licenseExpiry = dto.licenseExpiry ? new Date(dto.licenseExpiry) : null;
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    return this.prisma.driver.update({ where: { id }, data });
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
      where: { id, tenantId },
      include: {
        vehicle: true,
        driver: true,
        assignments: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { vehicle: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return serializeBigInt(route as any);
  }

  async createRoute(tenantId: string, dto: CreateRouteDto) {
    const data: any = {
      tenantId,
      name: dto.name,
      movementType: ((dto as any).movementType ?? (dto as any).type ?? 'AIRPORT_PICKUP'),
      originCity: (dto as any).originCity ?? (dto as any).origin ?? '',
      destCity: (dto as any).destCity ?? (dto as any).destination ?? '',
      pickupPoint: (dto as any).pickupPoint,
      dropoffPoint: (dto as any).dropoffPoint,
      distanceKm: dto.distanceKm,
      durationMins: (dto as any).durationMins ?? (dto as any).estimatedDuration,
      departureAt: (dto as any).departureAt ? new Date((dto as any).departureAt) : undefined,
      arrivalAt: (dto as any).arrivalAt ? new Date((dto as any).arrivalAt) : undefined,
      currency: (dto as any).currency ?? 'SAR',
      totalSeats: (dto as any).totalSeats,
      status: ((dto as any).status ?? 'ACTIVE').toUpperCase(),
      vehicleId: (dto as any).vehicleId || undefined,
      driverId: (dto as any).driverId || undefined,
      notes: (dto as any).notes,
    };
    if ((dto as any).pricePerSeat != null) data.pricePerSeatCents = BigInt(Math.round(Number((dto as any).pricePerSeat) * 100));
    if ((dto as any).pricePerSeatCents != null) data.pricePerSeatCents = BigInt((dto as any).pricePerSeatCents);
    if ((dto as any).pricePerVehicle != null) data.pricePerVehicleCents = BigInt(Math.round(Number((dto as any).pricePerVehicle) * 100));
    if ((dto as any).pricePerVehicleCents != null) data.pricePerVehicleCents = BigInt((dto as any).pricePerVehicleCents);
    const route = await this.prisma.transportRoute.create({ data });
    return serializeBigInt(route as any);
  }

  async updateRoute(tenantId: string, id: string, dto: any) {
    await this.findRouteById(tenantId, id);
    const data: any = {};
    for (const k of ['name', 'originCity', 'destCity', 'pickupPoint', 'dropoffPoint', 'distanceKm', 'durationMins', 'totalSeats', 'bookedSeats', 'vehicleId', 'driverId', 'notes', 'currency']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.movementType !== undefined) data.movementType = dto.movementType;
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.departureAt !== undefined) data.departureAt = dto.departureAt ? new Date(dto.departureAt) : null;
    if (dto.arrivalAt !== undefined) data.arrivalAt = dto.arrivalAt ? new Date(dto.arrivalAt) : null;
    if (dto.pricePerSeat != null) data.pricePerSeatCents = BigInt(Math.round(Number(dto.pricePerSeat) * 100));
    if (dto.pricePerSeatCents != null) data.pricePerSeatCents = BigInt(dto.pricePerSeatCents);
    if (dto.pricePerVehicle != null) data.pricePerVehicleCents = BigInt(Math.round(Number(dto.pricePerVehicle) * 100));
    if (dto.pricePerVehicleCents != null) data.pricePerVehicleCents = BigInt(dto.pricePerVehicleCents);
    const route = await this.prisma.transportRoute.update({ where: { id }, data });
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
      where: { id, tenantId },
      include: { vehicle: true, route: true, driver: true },
    });
    if (!a) throw new NotFoundException('Assignment not found');
    return serializeBigInt(a as any);
  }

  async createAssignment(tenantId: string, dto: CreateAssignmentDto) {
    const data: any = {
      tenantId,
      vehicleId: dto.vehicleId,
      routeId: (dto as any).routeId,
      driverId: (dto as any).driverId,
      bookingId: (dto as any).bookingId,
      groupId: (dto as any).groupId ?? (dto as any).tripGroupId,
      customerType: ((dto as any).customerType ?? 'PLATFORM_USER').toUpperCase(),
      customerName: (dto as any).customerName,
      customerEmail: (dto as any).customerEmail,
      customerPhone: (dto as any).customerPhone,
      pickupLocation: (dto as any).pickupLocation,
      dropoffLocation: (dto as any).dropoffLocation,
      scheduledAt: new Date((dto as any).scheduledAt),
      pilgrims: (dto as any).pilgrims ?? [],
      passengerCount: (dto as any).passengerCount ?? (dto as any).passengers ?? 1,
      currency: (dto as any).currency ?? 'SAR',
      paymentStatus: ((dto as any).paymentStatus ?? 'UNPAID').toUpperCase(),
      status: ((dto as any).status ?? 'SCHEDULED').toUpperCase(),
      notes: (dto as any).notes,
    };
    const priceCents = (dto as any).priceCents != null
      ? Number((dto as any).priceCents)
      : (dto as any).price != null
        ? Number((dto as any).price) * 100
        : 0;
    data.priceCents = BigInt(Math.round(priceCents));

    const assignment = await this.prisma.transportAssignment.create({ data });
    // Update bookedSeats on the route if applicable
    if (data.routeId) {
      await this.prisma.transportRoute.update({
        where: { id: data.routeId },
        data: { bookedSeats: { increment: data.passengerCount ?? 1 } },
      }).catch(() => undefined);
    }
    // Increment vehicle bookedSeats too
    await this.prisma.vehicle.update({
      where: { id: data.vehicleId },
      data: { bookedSeats: { increment: data.passengerCount ?? 1 } },
    }).catch(() => undefined);
    return serializeBigInt(assignment as any);
  }

  async updateAssignment(tenantId: string, id: string, dto: any) {
    await this.findAssignmentById(tenantId, id);
    const data: any = {};
    for (const k of ['vehicleId', 'routeId', 'driverId', 'customerName', 'customerEmail', 'customerPhone', 'pickupLocation', 'dropoffLocation', 'pilgrims', 'passengerCount', 'currency', 'notes', 'bookingId', 'groupId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.departedAt !== undefined) data.departedAt = dto.departedAt ? new Date(dto.departedAt) : null;
    if (dto.arrivedAt !== undefined) data.arrivedAt = dto.arrivedAt ? new Date(dto.arrivedAt) : null;
    if (dto.customerType !== undefined) data.customerType = String(dto.customerType).toUpperCase();
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.paymentStatus !== undefined) data.paymentStatus = String(dto.paymentStatus).toUpperCase();
    if (dto.priceCents != null) data.priceCents = BigInt(dto.priceCents);
    if (dto.price != null) data.priceCents = BigInt(Math.round(Number(dto.price) * 100));

    const a = await this.prisma.transportAssignment.update({ where: { id }, data });
    return serializeBigInt(a as any);
  }

  async cancelAssignment(tenantId: string, id: string) {
    const a = await this.findAssignmentById(tenantId, id);
    const passengers = (a as any).passengerCount ?? 1;
    const updated = await this.prisma.transportAssignment.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    if ((a as any).routeId) {
      await this.prisma.transportRoute.update({
        where: { id: (a as any).routeId },
        data: { bookedSeats: { decrement: passengers } },
      }).catch(() => undefined);
    }
    await this.prisma.vehicle.update({
      where: { id: (a as any).vehicleId },
      data: { bookedSeats: { decrement: passengers } },
    }).catch(() => undefined);
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
    return this.prisma.tasreehPermit.create({
      data: {
        tenantId,
        vehicleId: dto.vehicleId,
        permitNumber: dto.permitNumber,
        permitDate: new Date((dto as any).issueDate ?? (dto as any).permitDate ?? Date.now()),
        expiresAt: new Date((dto as any).expiryDate ?? (dto as any).expiresAt),
        zone: (dto as any).zone ?? ((dto as any).zones?.[0]) ?? 'MAKKAH',
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
