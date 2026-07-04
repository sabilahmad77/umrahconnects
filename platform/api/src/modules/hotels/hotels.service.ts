import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService) {}

  // ── Hotels ─────────────────────────────────────────────────────────────
  async findAll(tenantId: string, query: any) {
    const { city, search, starRating, status, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { OR: [{ tenantId }, { tenantId: null }] };
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (starRating) where.starRating = +starRating;
    if (status) where.status = status;
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.hotel.findMany({
        where, skip, take: +limit, orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { roomTypes: true, allotments: true, rooms: true, hotelBookings: true } },
          rooms: { select: { status: true, pricePerNightCents: true } },
          roomTypes: { select: { basePriceCents: true } },
        },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    const enriched = items.map((h: any) => {
      const rooms = h.rooms ?? [];
      const totalRooms = h.totalRooms || rooms.length;
      const bookedRooms = rooms.filter((r: any) => r.status === 'OCCUPIED').length;
      const availableRooms = rooms.filter((r: any) => r.status === 'AVAILABLE').length;
      const prices = [
        ...rooms.map((r: any) => Number(r.pricePerNightCents)),
        ...(h.roomTypes ?? []).map((rt: any) => Number(rt.basePriceCents)),
      ].filter((p) => p > 0);
      const startingPriceCents = prices.length ? Math.min(...prices) : 0;
      const occupancy = totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0;
      const { rooms: _r, roomTypes: _rt, ...rest } = h;
      return { ...rest, totalRooms, bookedRooms, availableRooms, startingPriceCents, occupancy };
    });
    return { items: enriched, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(tenantId: string, id: string) {
    const hotel = await this.prisma.hotel.findFirst({
      where: { id },
      include: {
        roomTypes: { orderBy: { name: 'asc' } },
        rooms: { orderBy: { roomNumber: 'asc' } },
        allotments: { where: { tenantId }, orderBy: { checkIn: 'asc' } },
        hotelBookings: { orderBy: { checkIn: 'desc' }, take: 20 },
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const rooms = hotel.rooms ?? [];
    const totalRooms = hotel.totalRooms || rooms.length;
    const bookedRooms = rooms.filter((r: any) => r.status === 'OCCUPIED').length;
    return {
      ...hotel,
      totalRooms,
      bookedRooms,
      availableRooms: rooms.filter((r: any) => r.status === 'AVAILABLE').length,
      occupancy: totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0,
      roomTypes: hotel.roomTypes.map((rt: any) => ({
        ...rt,
        basePriceCents: Number(rt.basePriceCents),
        pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null,
      })),
      rooms: rooms.map((r: any) => ({
        ...r,
        pricePerNightCents: Number(r.pricePerNightCents),
        pricePerPersonCents: r.pricePerPersonCents != null ? Number(r.pricePerPersonCents) : null,
      })),
      allotments: hotel.allotments.map((a: any) => ({ ...a, rateCents: Number(a.rateCents) })),
      hotelBookings: hotel.hotelBookings.map((b: any) => ({ ...b, totalAmountCents: Number(b.totalAmountCents) })),
    };
  }

  async create(tenantId: string, dto: any) {
    return this.prisma.hotel.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr,
        city: dto.city ?? 'MAKKAH',
        country: dto.country ?? 'SA',
        area: dto.area,
        address: dto.address,
        postalCode: dto.postalCode,
        starRating: dto.starRating != null ? Number(dto.starRating) : undefined,
        distanceToHaram: dto.distanceToHaram != null ? Number(dto.distanceToHaram) : undefined,
        amenities: dto.amenities ?? [],
        images: dto.images ?? dto.imageUrls ?? [],
        description: dto.description,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        cancellationPolicy: dto.cancellationPolicy,
        totalRooms: dto.totalRooms != null ? Number(dto.totalRooms) : 0,
        status: (dto.status ?? 'ACTIVE').toUpperCase(),
        notes: dto.notes,
        isVerified: false,
      },
    });
  }

  async update(tenantId: string, id: string, dto: any) {
    await this.findOne(tenantId, id);
    const data: any = {};
    for (const k of ['name', 'nameAr', 'city', 'country', 'area', 'address', 'postalCode', 'amenities', 'images', 'description', 'contactPerson', 'phone', 'email', 'checkInTime', 'checkOutTime', 'cancellationPolicy', 'notes']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.imageUrls !== undefined) data.images = dto.imageUrls;
    if (dto.starRating !== undefined) data.starRating = Number(dto.starRating);
    if (dto.distanceToHaram !== undefined) data.distanceToHaram = dto.distanceToHaram ? Number(dto.distanceToHaram) : null;
    if (dto.totalRooms !== undefined) data.totalRooms = Number(dto.totalRooms);
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    return this.prisma.hotel.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.hotel.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  // ── Room types ─────────────────────────────────────────────────────────
  async getRoomTypes(tenantId: string, hotelId: string) {
    const items = await this.prisma.roomType.findMany({ where: { hotelId }, orderBy: { name: 'asc' } });
    return items.map((rt: any) => ({
      ...rt,
      basePriceCents: Number(rt.basePriceCents),
      pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null,
    }));
  }

  async addRoomType(tenantId: string, hotelId: string, dto: any) {
    const occupancyMap: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TWIN: 2, TRIPLE: 3, QUAD: 4, QUINTUPLE: 5, SUITE: 2 };
    const occupancy = typeof dto.capacity === 'number'
      ? dto.capacity
      : (occupancyMap[String(dto.capacity ?? dto.bedConfiguration ?? '').toUpperCase()] ?? dto.maxOccupancy ?? dto.occupancy ?? 2);
    const basePriceCents = dto.basePriceCents != null
      ? BigInt(Math.round(Number(dto.basePriceCents)))
      : dto.basePrice != null
        ? BigInt(Math.round(Number(dto.basePrice) * 100))
        : BigInt(0);
    const rt = await this.prisma.roomType.create({
      data: {
        hotelId,
        name: dto.name,
        occupancy,
        bedConfig: dto.bedConfig ?? dto.bedConfiguration,
        description: dto.description,
        basePriceCents,
        pricePerPersonCents: dto.pricePerPersonCents != null ? BigInt(Math.round(Number(dto.pricePerPersonCents))) : undefined,
        totalCount: dto.totalCount != null ? Number(dto.totalCount) : 0,
        status: (dto.status ?? 'ACTIVE').toUpperCase(),
        amenities: dto.amenities ?? [],
        images: dto.images ?? [],
      },
    });
    return { ...rt, basePriceCents: Number(rt.basePriceCents), pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null };
  }

  async updateRoomType(tenantId: string, roomTypeId: string, dto: any) {
    const data: any = {};
    for (const k of ['name', 'bedConfig', 'description', 'amenities', 'images']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.occupancy !== undefined) data.occupancy = Number(dto.occupancy);
    if (dto.totalCount !== undefined) data.totalCount = Number(dto.totalCount);
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.basePriceCents !== undefined) data.basePriceCents = BigInt(Math.round(Number(dto.basePriceCents)));
    if (dto.basePrice !== undefined) data.basePriceCents = BigInt(Math.round(Number(dto.basePrice) * 100));
    if (dto.pricePerPersonCents !== undefined) data.pricePerPersonCents = dto.pricePerPersonCents != null ? BigInt(Math.round(Number(dto.pricePerPersonCents))) : null;
    const rt = await this.prisma.roomType.update({ where: { id: roomTypeId }, data });
    return { ...rt, basePriceCents: Number(rt.basePriceCents), pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null };
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  async getRooms(tenantId: string, hotelId: string) {
    const items = await this.prisma.room.findMany({ where: { hotelId }, orderBy: { roomNumber: 'asc' }, include: { roomType: { select: { id: true, name: true } } } });
    return items.map((r: any) => ({
      ...r,
      pricePerNightCents: Number(r.pricePerNightCents),
      pricePerPersonCents: r.pricePerPersonCents != null ? Number(r.pricePerPersonCents) : null,
    }));
  }

  async createRoom(tenantId: string, hotelId: string, dto: any) {
    const hotel = await this.prisma.hotel.findFirst({ where: { id: hotelId } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const bedCount = dto.bedCount != null ? Number(dto.bedCount) : 1;
    const room = await this.prisma.room.create({
      data: {
        tenantId,
        hotelId,
        roomTypeId: dto.roomTypeId || undefined,
        roomNumber: dto.roomNumber ?? dto.name ?? 'Room',
        floor: dto.floor,
        capacity: dto.capacity != null ? Number(dto.capacity) : 2,
        bedType: dto.bedType,
        bedCount,
        availableBeds: dto.availableBeds != null ? Number(dto.availableBeds) : bedCount,
        pricePerNightCents: dto.pricePerNightCents != null
          ? BigInt(Math.round(Number(dto.pricePerNightCents)))
          : dto.pricePerNight != null
            ? BigInt(Math.round(Number(dto.pricePerNight) * 100))
            : BigInt(0),
        pricePerPersonCents: dto.pricePerPersonCents != null
          ? BigInt(Math.round(Number(dto.pricePerPersonCents)))
          : dto.pricePerPerson != null
            ? BigInt(Math.round(Number(dto.pricePerPerson) * 100))
            : undefined,
        seasonalPricing: dto.seasonalPricing ?? [],
        images: dto.images ?? [],
        facilities: dto.facilities ?? [],
        description: dto.description,
        status: (dto.status ?? 'AVAILABLE').toUpperCase(),
        notes: dto.notes,
      },
    });
    const count = await this.prisma.room.count({ where: { hotelId } });
    await this.prisma.hotel.update({ where: { id: hotelId }, data: { totalRooms: count } }).catch(() => undefined);
    return { ...room, pricePerNightCents: Number(room.pricePerNightCents), pricePerPersonCents: room.pricePerPersonCents != null ? Number(room.pricePerPersonCents) : null };
  }

  async updateRoom(tenantId: string, roomId: string, dto: any) {
    const data: any = {};
    for (const k of ['roomNumber', 'floor', 'bedType', 'images', 'facilities', 'description', 'notes', 'roomTypeId', 'seasonalPricing']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.capacity !== undefined) data.capacity = Number(dto.capacity);
    if (dto.bedCount !== undefined) data.bedCount = Number(dto.bedCount);
    if (dto.availableBeds !== undefined) data.availableBeds = Number(dto.availableBeds);
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.pricePerNightCents !== undefined) data.pricePerNightCents = BigInt(Math.round(Number(dto.pricePerNightCents)));
    if (dto.pricePerNight !== undefined) data.pricePerNightCents = BigInt(Math.round(Number(dto.pricePerNight) * 100));
    if (dto.pricePerPersonCents !== undefined) data.pricePerPersonCents = dto.pricePerPersonCents != null ? BigInt(Math.round(Number(dto.pricePerPersonCents))) : null;
    if (dto.pricePerPerson !== undefined) data.pricePerPersonCents = dto.pricePerPerson != null ? BigInt(Math.round(Number(dto.pricePerPerson) * 100)) : null;
    const room = await this.prisma.room.update({ where: { id: roomId }, data });
    return { ...room, pricePerNightCents: Number(room.pricePerNightCents), pricePerPersonCents: room.pricePerPersonCents != null ? Number(room.pricePerPersonCents) : null };
  }

  async deleteRoom(tenantId: string, roomId: string) {
    return this.prisma.room.update({ where: { id: roomId }, data: { status: 'INACTIVE' } });
  }

  // ── Hotel bookings (direct guest bookings) ─────────────────────────────
  async getHotelBookings(tenantId: string, filter: { hotelId?: string; status?: string } = {}) {
    const where: any = { tenantId };
    if (filter.hotelId) where.hotelId = filter.hotelId;
    if (filter.status) where.status = filter.status;
    const items = await this.prisma.hotelBooking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { hotel: { select: { id: true, name: true, city: true } } },
    });
    return items.map((b: any) => ({ ...b, totalAmountCents: Number(b.totalAmountCents) }));
  }

  async findHotelBooking(tenantId: string, id: string) {
    const b = await this.prisma.hotelBooking.findFirst({
      where: { id, tenantId },
      include: { hotel: { select: { id: true, name: true, city: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return { ...b, totalAmountCents: Number(b.totalAmountCents) };
  }

  async createHotelBooking(tenantId: string, dto: any) {
    const hotel = await this.prisma.hotel.findFirst({ where: { id: dto.hotelId } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const totalAmountCents = dto.totalAmountCents != null
      ? BigInt(Math.round(Number(dto.totalAmountCents)))
      : dto.amount != null
        ? BigInt(Math.round(Number(dto.amount) * 100))
        : BigInt(0);
    const booking = await this.prisma.hotelBooking.create({
      data: {
        tenantId,
        hotelId: dto.hotelId,
        roomTypeId: dto.roomTypeId || undefined,
        roomId: dto.roomId || undefined,
        customerUserId: dto.customerUserId && String(dto.customerUserId).length === 36 ? dto.customerUserId : undefined,
        guestName: dto.guestName ?? 'Guest',
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        guestNationality: dto.guestNationality,
        source: (dto.source ?? 'EXTERNAL').toUpperCase(),
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        guests: dto.guests != null ? Number(dto.guests) : 1,
        totalAmountCents,
        currency: dto.currency ?? 'SAR',
        status: (dto.status ?? 'PENDING').toUpperCase(),
        paymentStatus: (dto.paymentStatus ?? 'UNPAID').toUpperCase(),
        notes: dto.notes,
      },
    });
    if (dto.roomId) {
      await this.prisma.room.update({ where: { id: dto.roomId }, data: { status: 'OCCUPIED' } }).catch(() => undefined);
    }
    return { ...booking, totalAmountCents: Number(booking.totalAmountCents) };
  }

  async updateHotelBooking(tenantId: string, id: string, dto: any) {
    await this.findHotelBooking(tenantId, id);
    const data: any = {};
    for (const k of ['guestName', 'guestEmail', 'guestPhone', 'guestNationality', 'notes', 'roomId', 'roomTypeId']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.checkIn !== undefined) data.checkIn = new Date(dto.checkIn);
    if (dto.checkOut !== undefined) data.checkOut = new Date(dto.checkOut);
    if (dto.guests !== undefined) data.guests = Number(dto.guests);
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.paymentStatus !== undefined) data.paymentStatus = String(dto.paymentStatus).toUpperCase();
    if (dto.source !== undefined) data.source = String(dto.source).toUpperCase();
    if (dto.totalAmountCents !== undefined) data.totalAmountCents = BigInt(Math.round(Number(dto.totalAmountCents)));
    if (dto.amount !== undefined) data.totalAmountCents = BigInt(Math.round(Number(dto.amount) * 100));
    const booking = await this.prisma.hotelBooking.update({ where: { id }, data });
    if (data.status === 'CANCELLED' && booking.roomId) {
      await this.prisma.room.update({ where: { id: booking.roomId }, data: { status: 'AVAILABLE' } }).catch(() => undefined);
    }
    if (data.status === 'CHECKED_IN' && booking.roomId) {
      await this.prisma.room.update({ where: { id: booking.roomId }, data: { status: 'OCCUPIED' } }).catch(() => undefined);
    }
    if (data.status === 'CHECKED_OUT' && booking.roomId) {
      await this.prisma.room.update({ where: { id: booking.roomId }, data: { status: 'AVAILABLE' } }).catch(() => undefined);
    }
    return { ...booking, totalAmountCents: Number(booking.totalAmountCents) };
  }

  // ── Allotments (legacy operator contracts) ─────────────────────────────
  async getAllotments(tenantId: string, hotelId: string) {
    const allotments = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, orderBy: { checkIn: 'asc' } });
    return allotments.map((a: any) => ({ ...a, rateCents: Number(a.rateCents) }));
  }

  async createAllotment(tenantId: string, hotelId: string, dto: any) {
    const allotment = await this.prisma.allotment.create({
      data: {
        tenantId, hotelId,
        roomTypeId: dto.roomTypeId,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        totalRooms: dto.totalRooms,
        bookedRooms: 0,
        rateCents: BigInt(Math.round((dto.rateCents ?? dto.contractPrice ?? 0) * (dto.contractPrice ? 100 : 1))),
        currency: dto.currency ?? 'SAR',
        cancellationPolicy: {},
      },
    });
    return { ...allotment, rateCents: Number(allotment.rateCents) };
  }

  async getAssignments(tenantId: string, hotelId: string) {
    const allotmentsForHotel = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, select: { id: true } });
    const allotmentIds = allotmentsForHotel.map((a: any) => a.id);
    return this.prisma.roomAssignment.findMany({ where: { tenantId, allotmentId: { in: allotmentIds } }, orderBy: { checkIn: 'asc' } });
  }

  async createAssignment(tenantId: string, hotelId: string, dto: any) {
    if (dto.allotmentId) {
      await this.prisma.allotment.update({ where: { id: dto.allotmentId }, data: { bookedRooms: { increment: 1 } } });
    }
    return this.prisma.roomAssignment.create({
      data: {
        tenantId,
        allotmentId: dto.allotmentId,
        bookingId: dto.bookingId,
        checkIn: new Date(dto.checkIn),
        checkOut: new Date(dto.checkOut),
        roomNumber: dto.roomNumber,
        pilgrims: dto.pilgrims ?? [],
        confirmedAt: new Date(),
      },
    });
  }

  async checkAvailability(tenantId: string, query: any) {
    const { city, checkIn, checkOut } = query;
    const where: any = {};
    if (city) where.hotel = { city: { contains: city, mode: 'insensitive' } };
    if (checkIn) where.checkIn = { lte: new Date(checkIn) };
    if (checkOut) where.checkOut = { gte: new Date(checkOut) };
    const allotments = await this.prisma.allotment.findMany({
      where: { tenantId, ...where },
      include: { hotel: { select: { id: true, name: true, city: true, starRating: true } } },
    });
    return allotments.map((a: any) => ({
      ...a,
      rateCents: Number(a.rateCents),
      availableRooms: Math.max(0, a.totalRooms - a.bookedRooms),
    }));
  }

  // ── Hotel Owner dashboard stats ────────────────────────────────────────
  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);

    const [
      totalHotels, activeHotels, totalRoomTypes, allRooms,
      hotelBookings, upcomingCheckIns, upcomingCheckOuts,
    ] = await Promise.all([
      this.prisma.hotel.count({ where: { OR: [{ tenantId }, { tenantId: null }] } }),
      this.prisma.hotel.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.roomType.count({ where: { hotel: { tenantId } } }),
      this.prisma.room.findMany({ where: { tenantId }, select: { status: true } }),
      this.prisma.hotelBooking.findMany({
        where: { tenantId },
        select: { status: true, paymentStatus: true, totalAmountCents: true, checkIn: true, checkOut: true, guestName: true, id: true, hotelId: true },
      }),
      this.prisma.hotelBooking.findMany({
        where: { tenantId, checkIn: { gte: today, lte: in7days }, status: { in: ['CONFIRMED', 'PENDING'] } },
        orderBy: { checkIn: 'asc' }, take: 8,
        include: { hotel: { select: { name: true } } },
      }),
      this.prisma.hotelBooking.findMany({
        where: { tenantId, checkOut: { gte: today, lte: in7days }, status: { in: ['CONFIRMED', 'CHECKED_IN'] } },
        orderBy: { checkOut: 'asc' }, take: 8,
        include: { hotel: { select: { name: true } } },
      }),
    ]);

    const totalRooms = allRooms.length;
    const availableRooms = allRooms.filter((r) => r.status === 'AVAILABLE').length;
    const bookedRooms = allRooms.filter((r) => r.status === 'OCCUPIED').length;
    const maintenanceRooms = allRooms.filter((r) => r.status === 'MAINTENANCE').length;

    const revenueCollected = hotelBookings
      .filter((b) => b.paymentStatus === 'PAID')
      .reduce((sum, b) => sum + Number(b.totalAmountCents), 0);
    const outstanding = hotelBookings
      .filter((b) => ['UNPAID', 'PARTIAL'].includes(b.paymentStatus) && b.status !== 'CANCELLED')
      .reduce((sum, b) => sum + Number(b.totalAmountCents), 0);
    const pendingRequests = hotelBookings.filter((b) => b.status === 'PENDING').length;

    const vendor = await this.prisma.vendor.findFirst({ where: { tenantId } });
    const activeListings = vendor
      ? await this.prisma.listing.count({ where: { vendorId: vendor.id, isActive: true } })
      : 0;
    const recentInquiries = vendor
      ? await this.prisma.listingInquiry.findMany({
          where: { listing: { vendorId: vendor.id } },
          orderBy: { createdAt: 'desc' }, take: 5,
          include: { listing: { select: { name: true } } },
        })
      : [];

    return {
      hotels: { total: totalHotels, active: activeHotels },
      rooms: { total: totalRooms, roomTypes: totalRoomTypes, available: availableRooms, booked: bookedRooms, maintenance: maintenanceRooms },
      occupancyRate: totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0,
      revenue: { collectedCents: revenueCollected, outstandingCents: outstanding, currency: 'SAR' },
      bookings: {
        total: hotelBookings.length,
        pending: pendingRequests,
        confirmed: hotelBookings.filter((b) => b.status === 'CONFIRMED').length,
        checkedIn: hotelBookings.filter((b) => b.status === 'CHECKED_IN').length,
      },
      upcomingCheckIns: upcomingCheckIns.map((b: any) => ({ id: b.id, guestName: b.guestName, hotel: b.hotel?.name, checkIn: b.checkIn })),
      upcomingCheckOuts: upcomingCheckOuts.map((b: any) => ({ id: b.id, guestName: b.guestName, hotel: b.hotel?.name, checkOut: b.checkOut })),
      marketplace: { activeListings, recentInquiries: recentInquiries.map((i: any) => ({ id: i.id, listingName: i.listing?.name, fromName: i.fromName, status: i.status, createdAt: i.createdAt })) },
    };
  }
}
