import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAllOwned, findOwned, requireId } from '../../common/tenant-scope';
import {
  CreateAllotmentDto, CreateHotelBookingDto, CreateHotelDto, CreateRoomAssignmentDto, CreateRoomDto,
  CreateRoomTypeDto, UpdateHotelBookingDto, UpdateHotelDto, UpdateRoomDto, UpdateRoomTypeDto,
} from './dto/hotel.dto';

/** Money in: prefers explicit cents, else major units ×100. `null` clears; `undefined` = not provided. */
function toCents(major?: number | null, cents?: number | null): bigint | null | undefined {
  if (cents != null) return BigInt(Math.round(cents));
  if (major != null) return BigInt(Math.round(major * 100));
  if (cents === null || major === null) return null;
  return undefined;
}

function assertStayDates(checkIn: Date, checkOut: Date) {
  if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) throw new BadRequestException('checkIn and checkOut must be valid dates');
  if (checkOut <= checkIn) throw new BadRequestException('checkOut must be after checkIn');
}

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

  // ── Ownership helpers ──────────────────────────────────────────────────
  /** A hotel the caller may READ: its own, or a shared marketplace hotel (tenantId null). */
  private async readableHotel(tenantId: string, id: unknown) {
    const safeId = requireId(id, 'Hotel');
    if (!tenantId) throw new NotFoundException('Hotel not found');
    const hotel = await this.prisma.hotel.findFirst({
      where: { id: safeId, OR: [{ tenantId }, { tenantId: null }] },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  /** A hotel the caller may WRITE: only its own. Shared marketplace hotels are read-only. */
  private async ownedHotel(tenantId: string, id: unknown) {
    const hotel = await this.readableHotel(tenantId, id);
    if (hotel.tenantId !== tenantId) {
      throw new ForbiddenException('Shared marketplace hotels are read-only');
    }
    return hotel;
  }

  /** A room type the caller may write: its hotel must be owned by the caller. */
  private async ownedRoomType(tenantId: string, id: unknown) {
    const safeId = requireId(id, 'Room type');
    if (!tenantId) throw new NotFoundException('Room type not found');
    const rt = await this.prisma.roomType.findFirst({ where: { id: safeId, hotel: { tenantId } } });
    if (!rt) throw new NotFoundException('Room type not found');
    return rt;
  }

  /** Validates that an (optional) room type id belongs to the given hotel. */
  private async assertRoomTypeInHotel(roomTypeId: unknown, hotelId: string) {
    if (roomTypeId === undefined || roomTypeId === null || roomTypeId === '') return;
    const safeId = requireId(roomTypeId, 'Room type');
    const rt = await this.prisma.roomType.findFirst({ where: { id: safeId, hotelId }, select: { id: true } });
    if (!rt) throw new NotFoundException('Room type not found');
  }

  /** Recomputes the hotel's room counter from the rooms that actually exist. */
  private async syncHotelRoomCount(tenantId: string, hotelId: string) {
    const count = await this.prisma.room.count({ where: { hotelId, tenantId, status: { not: 'INACTIVE' } } });
    await this.prisma.hotel.updateMany({ where: { id: hotelId, tenantId }, data: { totalRooms: count } });
  }

  async findOne(tenantId: string, id: string) {
    const readable = await this.readableHotel(tenantId, id);
    const hotel = await this.prisma.hotel.findFirst({
      where: { id: readable.id },
      include: {
        roomTypes: { orderBy: { name: 'asc' } },
        rooms: { where: { tenantId }, orderBy: { roomNumber: 'asc' } },
        allotments: { where: { tenantId }, orderBy: { checkIn: 'asc' } },
        hotelBookings: { where: { tenantId }, orderBy: { checkIn: 'desc' }, take: 20 },
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

  async create(tenantId: string, dto: CreateHotelDto) {
    return this.prisma.hotel.create({
      data: {
        tenantId,
        name: dto.name,
        nameAr: dto.nameAr,
        city: dto.city || 'MAKKAH',
        country: dto.country || 'SA',
        area: dto.area,
        address: dto.address,
        postalCode: dto.postalCode,
        starRating: dto.starRating ?? undefined,
        distanceToHaram: (dto.distanceToHaram ?? dto.distanceFromHaram) != null
          ? Math.round((dto.distanceToHaram ?? dto.distanceFromHaram) as number)
          : undefined,
        amenities: dto.amenities ?? [],
        images: dto.images ?? dto.imageUrls ?? [],
        description: dto.description,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email || undefined,
        checkInTime: dto.checkInTime,
        checkOutTime: dto.checkOutTime,
        cancellationPolicy: dto.cancellationPolicy,
        // Room counter is server-owned: it starts at 0 and follows the rooms actually created.
        totalRooms: 0,
        status: dto.status ?? 'ACTIVE',
        notes: dto.notes,
        isVerified: false,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateHotelDto) {
    const hotel = await this.ownedHotel(tenantId, id);
    const data: any = {};
    for (const k of ['nameAr', 'area', 'address', 'postalCode', 'amenities', 'images', 'description', 'contactPerson', 'phone', 'email', 'checkInTime', 'checkOutTime', 'cancellationPolicy', 'notes', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: a cleared form field ('') leaves the stored value unchanged.
    for (const k of ['name', 'city', 'country'] as const) {
      if (dto[k]) data[k] = dto[k];
    }
    if (dto.imageUrls !== undefined) data.images = dto.imageUrls;
    if (dto.starRating !== undefined) data.starRating = dto.starRating || null;
    if (dto.distanceToHaram !== undefined) data.distanceToHaram = dto.distanceToHaram != null ? Math.round(dto.distanceToHaram) : null;
    // totalRooms is server-owned (derived from rooms) and is ignored if sent.
    return this.prisma.hotel.update({ where: { id: hotel.id }, data });
  }

  async remove(tenantId: string, id: string) {
    const hotel = await this.ownedHotel(tenantId, id);
    return this.prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'INACTIVE' } });
  }

  // ── Room types ─────────────────────────────────────────────────────────
  async getRoomTypes(tenantId: string, hotelId: string) {
    const hotel = await this.readableHotel(tenantId, hotelId);
    const items = await this.prisma.roomType.findMany({ where: { hotelId: hotel.id }, orderBy: { name: 'asc' } });
    return items.map((rt: any) => ({
      ...rt,
      basePriceCents: Number(rt.basePriceCents),
      pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null,
    }));
  }

  async addRoomType(tenantId: string, hotelId: string, dto: CreateRoomTypeDto) {
    const hotel = await this.ownedHotel(tenantId, hotelId);
    const occupancyMap: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TWIN: 2, TRIPLE: 3, QUAD: 4, QUINTUPLE: 5, SUITE: 2 };
    const capacityNum = dto.capacity != null && dto.capacity !== '' && !isNaN(Number(dto.capacity)) ? Number(dto.capacity) : undefined;
    const occupancy = capacityNum
      ?? occupancyMap[String(dto.capacity ?? dto.bedConfiguration ?? '').toUpperCase()]
      ?? dto.maxOccupancy ?? dto.occupancy ?? 2;
    if (!Number.isInteger(occupancy) || occupancy < 1 || occupancy > 20) {
      throw new BadRequestException('Room type occupancy must be an integer between 1 and 20');
    }
    const rt = await this.prisma.roomType.create({
      data: {
        hotelId: hotel.id,
        name: dto.name,
        occupancy,
        bedConfig: dto.bedConfig ?? dto.bedConfiguration,
        description: dto.description,
        basePriceCents: toCents(dto.basePrice, dto.basePriceCents) ?? BigInt(0),
        pricePerPersonCents: toCents(dto.pricePerPerson, dto.pricePerPersonCents) ?? undefined,
        totalCount: dto.totalCount ?? 0,
        status: dto.status ?? 'ACTIVE',
        amenities: dto.amenities ?? [],
        images: dto.images ?? [],
      },
    });
    return { ...rt, basePriceCents: Number(rt.basePriceCents), pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null };
  }

  async updateRoomType(tenantId: string, roomTypeId: string, dto: UpdateRoomTypeDto) {
    const existing = await this.ownedRoomType(tenantId, roomTypeId);
    const data: any = {};
    for (const k of ['name', 'bedConfig', 'description', 'amenities', 'images', 'occupancy', 'totalCount', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.basePriceCents !== undefined || dto.basePrice !== undefined) {
      data.basePriceCents = toCents(dto.basePrice, dto.basePriceCents) ?? BigInt(0);
    }
    if (dto.pricePerPersonCents !== undefined || dto.pricePerPerson !== undefined) {
      data.pricePerPersonCents = toCents(dto.pricePerPerson, dto.pricePerPersonCents);
    }
    const rt = await this.prisma.roomType.update({ where: { id: existing.id }, data });
    return { ...rt, basePriceCents: Number(rt.basePriceCents), pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null };
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  async getRooms(tenantId: string, hotelId: string) {
    const hotel = await this.readableHotel(tenantId, hotelId);
    const items = await this.prisma.room.findMany({
      where: { hotelId: hotel.id, tenantId },
      orderBy: { roomNumber: 'asc' },
      include: { roomType: { select: { id: true, name: true } } },
    });
    return items.map((r: any) => ({
      ...r,
      pricePerNightCents: Number(r.pricePerNightCents),
      pricePerPersonCents: r.pricePerPersonCents != null ? Number(r.pricePerPersonCents) : null,
    }));
  }

  async createRoom(tenantId: string, hotelId: string, dto: CreateRoomDto) {
    const hotel = await this.ownedHotel(tenantId, hotelId);
    await this.assertRoomTypeInHotel(dto.roomTypeId, hotel.id);
    const bedCount = dto.bedCount ?? 1;
    const availableBeds = dto.availableBeds ?? bedCount;
    if (availableBeds > bedCount) throw new BadRequestException('availableBeds cannot exceed bedCount');
    const room = await this.prisma.room.create({
      data: {
        tenantId,
        hotelId: hotel.id,
        roomTypeId: dto.roomTypeId || undefined,
        roomNumber: String(dto.roomNumber ?? dto.name ?? 'Room'),
        floor: dto.floor != null && dto.floor !== '' ? String(dto.floor) : undefined,
        capacity: dto.capacity ?? 2,
        bedType: dto.bedType,
        bedCount,
        availableBeds,
        pricePerNightCents: toCents(dto.pricePerNight, dto.pricePerNightCents) ?? BigInt(0),
        pricePerPersonCents: toCents(dto.pricePerPerson, dto.pricePerPersonCents) ?? undefined,
        seasonalPricing: (dto.seasonalPricing ?? []) as any,
        images: dto.images ?? [],
        facilities: dto.facilities ?? [],
        description: dto.description,
        status: dto.status ?? 'AVAILABLE',
        notes: dto.notes,
      },
    });
    await this.syncHotelRoomCount(tenantId, hotel.id);
    return { ...room, pricePerNightCents: Number(room.pricePerNightCents), pricePerPersonCents: room.pricePerPersonCents != null ? Number(room.pricePerPersonCents) : null };
  }

  async updateRoom(tenantId: string, roomId: string, dto: UpdateRoomDto) {
    const existing = await findOwned<{ id: string; hotelId: string; bedCount: number; availableBeds: number }>(
      this.prisma.room, roomId, tenantId, 'Room',
    );
    const data: any = {};
    for (const k of ['bedType', 'images', 'facilities', 'description', 'notes', 'capacity', 'bedCount', 'availableBeds', 'status'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.seasonalPricing !== undefined) data.seasonalPricing = dto.seasonalPricing ?? [];
    if (dto.roomTypeId !== undefined) {
      await this.assertRoomTypeInHotel(dto.roomTypeId, existing.hotelId);
      data.roomTypeId = dto.roomTypeId || null;
    }
    if (dto.roomNumber !== undefined && dto.roomNumber !== null) data.roomNumber = String(dto.roomNumber);
    if (dto.floor !== undefined) data.floor = dto.floor != null && dto.floor !== '' ? String(dto.floor) : null;
    const bedCount = data.bedCount ?? existing.bedCount;
    const availableBeds = data.availableBeds ?? existing.availableBeds;
    if ((data.bedCount !== undefined || data.availableBeds !== undefined) && availableBeds > bedCount) {
      throw new BadRequestException('availableBeds cannot exceed bedCount');
    }
    if (dto.pricePerNightCents !== undefined || dto.pricePerNight !== undefined) {
      data.pricePerNightCents = toCents(dto.pricePerNight, dto.pricePerNightCents) ?? BigInt(0);
    }
    if (dto.pricePerPersonCents !== undefined || dto.pricePerPerson !== undefined) {
      data.pricePerPersonCents = toCents(dto.pricePerPerson, dto.pricePerPersonCents);
    }
    const room = await this.prisma.room.update({ where: { id: existing.id }, data });
    if (data.status !== undefined) await this.syncHotelRoomCount(tenantId, existing.hotelId);
    return { ...room, pricePerNightCents: Number(room.pricePerNightCents), pricePerPersonCents: room.pricePerPersonCents != null ? Number(room.pricePerPersonCents) : null };
  }

  async deleteRoom(tenantId: string, roomId: string) {
    const existing = await findOwned<{ id: string; hotelId: string }>(this.prisma.room, roomId, tenantId, 'Room');
    const room = await this.prisma.room.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } });
    await this.syncHotelRoomCount(tenantId, existing.hotelId);
    return room;
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

  async createHotelBooking(tenantId: string, dto: CreateHotelBookingDto) {
    if (!dto.hotelId) throw new BadRequestException('hotelId is required');
    // Direct bookings may only be recorded against the caller's own hotels.
    const hotel = await this.ownedHotel(tenantId, dto.hotelId);
    await this.assertRoomTypeInHotel(dto.roomTypeId, hotel.id);
    if (dto.roomId) await findOwned(this.prisma.room, dto.roomId, tenantId, 'Room', { hotelId: hotel.id }, { id: true });
    if (dto.customerUserId) await findOwned(this.prisma.user, dto.customerUserId, tenantId, 'Customer', {}, { id: true });
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    assertStayDates(checkIn, checkOut);
    const booking = await this.prisma.hotelBooking.create({
      data: {
        tenantId,
        hotelId: hotel.id,
        roomTypeId: dto.roomTypeId || undefined,
        roomId: dto.roomId || undefined,
        customerUserId: dto.customerUserId || undefined,
        guestName: dto.guestName || 'Guest',
        guestEmail: dto.guestEmail || undefined,
        guestPhone: dto.guestPhone || undefined,
        guestNationality: dto.guestNationality || undefined,
        source: dto.source ?? 'EXTERNAL',
        checkIn,
        checkOut,
        guests: dto.guests ?? 1,
        totalAmountCents: toCents(dto.amount, dto.totalAmountCents) ?? BigInt(0),
        currency: dto.currency ?? 'SAR',
        status: dto.status ?? 'PENDING',
        paymentStatus: dto.paymentStatus ?? 'UNPAID',
        notes: dto.notes,
      },
    });
    if (booking.roomId && booking.status !== 'CANCELLED' && booking.status !== 'CHECKED_OUT' && booking.status !== 'COMPLETED') {
      await this.prisma.room.updateMany({ where: { id: booking.roomId, tenantId }, data: { status: 'OCCUPIED' } });
    }
    return { ...booking, totalAmountCents: Number(booking.totalAmountCents) };
  }

  async updateHotelBooking(tenantId: string, id: string, dto: UpdateHotelBookingDto) {
    const existing = await this.findHotelBooking(tenantId, id);
    const data: any = {};
    for (const k of ['guestName', 'guestPhone', 'guestNationality', 'notes', 'guests', 'status', 'paymentStatus', 'source'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.guestEmail !== undefined) data.guestEmail = dto.guestEmail || null;
    if (dto.roomTypeId !== undefined) {
      await this.assertRoomTypeInHotel(dto.roomTypeId, existing.hotelId);
      data.roomTypeId = dto.roomTypeId || null;
    }
    if (dto.roomId !== undefined) {
      if (dto.roomId) {
        await findOwned(this.prisma.room, dto.roomId, tenantId, 'Room', { hotelId: existing.hotelId }, { id: true });
      }
      data.roomId = dto.roomId || null;
    }
    if (dto.checkIn !== undefined) data.checkIn = new Date(dto.checkIn);
    if (dto.checkOut !== undefined) data.checkOut = new Date(dto.checkOut);
    if (data.checkIn || data.checkOut) assertStayDates(data.checkIn ?? existing.checkIn, data.checkOut ?? existing.checkOut);
    if (dto.totalAmountCents !== undefined || dto.amount !== undefined) {
      data.totalAmountCents = toCents(dto.amount, dto.totalAmountCents) ?? BigInt(0);
    }
    const booking = await this.prisma.hotelBooking.update({ where: { id: existing.id }, data });
    // Room status follows the booking — only rooms of the caller's tenant are ever touched.
    if (booking.roomId) {
      const roomStatus =
        data.status === 'CANCELLED' || data.status === 'CHECKED_OUT' ? 'AVAILABLE'
          : data.status === 'CHECKED_IN' ? 'OCCUPIED'
            : undefined;
      if (roomStatus) {
        await this.prisma.room.updateMany({ where: { id: booking.roomId, tenantId }, data: { status: roomStatus } });
      }
    }
    return { ...booking, totalAmountCents: Number(booking.totalAmountCents) };
  }

  // ── Allotments (legacy operator contracts) ─────────────────────────────
  async getAllotments(tenantId: string, hotelId: string) {
    const allotments = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, orderBy: { checkIn: 'asc' } });
    return allotments.map((a: any) => ({ ...a, rateCents: Number(a.rateCents) }));
  }

  async createAllotment(tenantId: string, hotelId: string, dto: CreateAllotmentDto) {
    // Operators contract allotments on their own hotels or on shared marketplace hotels.
    const hotel = await this.readableHotel(tenantId, hotelId);
    await this.assertRoomTypeInHotel(dto.roomTypeId, hotel.id);
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    assertStayDates(checkIn, checkOut);
    const allotment = await this.prisma.allotment.create({
      data: {
        tenantId,
        hotelId: hotel.id,
        roomTypeId: dto.roomTypeId || undefined,
        contractType: dto.contractType ?? undefined,
        checkIn,
        checkOut,
        totalRooms: dto.totalRooms,
        bookedRooms: 0,
        overbookBuffer: dto.overbookBuffer ?? 0,
        rateCents: toCents(dto.contractPrice, dto.rateCents) ?? BigInt(0),
        currency: dto.currency ?? 'SAR',
        cancellationPolicy: {},
        notes: dto.notes ?? dto.contractRef,
      },
    });
    return { ...allotment, rateCents: Number(allotment.rateCents) };
  }

  async getAssignments(tenantId: string, hotelId: string) {
    const allotmentsForHotel = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, select: { id: true } });
    const allotmentIds = allotmentsForHotel.map((a: any) => a.id);
    return this.prisma.roomAssignment.findMany({ where: { tenantId, allotmentId: { in: allotmentIds } }, orderBy: { checkIn: 'asc' } });
  }

  async createAssignment(tenantId: string, hotelId: string, dto: CreateRoomAssignmentDto) {
    const safeHotelId = requireId(hotelId, 'Hotel');
    const allotment = await findOwned<{ id: string; totalRooms: number; bookedRooms: number; overbookBuffer: number; checkIn: Date; checkOut: Date }>(
      this.prisma.allotment, dto.allotmentId, tenantId, 'Allotment', { hotelId: safeHotelId },
    );
    await findOwned(this.prisma.booking, dto.bookingId, tenantId, 'Booking', {}, { id: true });
    await assertAllOwned(this.prisma.pilgrim, dto.pilgrims, tenantId, 'Pilgrim');
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    assertStayDates(checkIn, checkOut);
    if (checkIn < allotment.checkIn || checkOut > allotment.checkOut) {
      throw new BadRequestException('Assignment dates must fall within the allotment period');
    }

    return this.prisma.$transaction(async (tx) => {
      // Optimistic, tenant-scoped capacity claim: fails if another request took the room first.
      const capacity = allotment.totalRooms + (allotment.overbookBuffer ?? 0);
      if (allotment.bookedRooms >= capacity) throw new ConflictException('Allotment is fully booked');
      const claimed = await tx.allotment.updateMany({
        where: { id: allotment.id, tenantId, bookedRooms: allotment.bookedRooms },
        data: { bookedRooms: { increment: 1 } },
      });
      if (claimed.count !== 1) throw new ConflictException('Allotment changed concurrently, please retry');
      return tx.roomAssignment.create({
        data: {
          tenantId,
          allotmentId: allotment.id,
          bookingId: dto.bookingId,
          checkIn,
          checkOut,
          roomNumber: dto.roomNumber,
          pilgrims: dto.pilgrims ?? [],
          confirmedAt: new Date(),
        },
      });
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
