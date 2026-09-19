import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertAllOwned, findOwned, requireId } from '../../common/tenant-scope';
import {
  CreateAllotmentDto, CreateHotelBookingDto, CreateHotelDto, CreateRoomAssignmentDto, CreateRoomDto,
  CreateRoomTypeDto, QueryAvailabilityDto, QueryRoomAvailabilityDto, UpdateAllotmentDto, UpdateHotelBookingDto,
  UpdateHotelDto, UpdateRoomDto, UpdateRoomTypeDto,
} from './dto/hotel.dto';
import {
  HOTEL_BOOKING_INITIAL_STATUSES, HOTEL_BOOKING_TERMINAL_STATUSES, HOTEL_BOOKING_TRANSITIONS, ROOM_HOLDING_STATUSES,
  ROOM_MANUAL_STATUSES, assertHotelBookingTransition, rejectClientPaymentStatus,
} from './hotel-workflow';

type Tx = Prisma.TransactionClient;

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

const day = (d: Date) => d.toISOString().slice(0, 10);
const startOfToday = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const sameText = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const serializeRoomType = (rt: any) => ({
  ...rt,
  basePriceCents: Number(rt.basePriceCents),
  pricePerPersonCents: rt.pricePerPersonCents != null ? Number(rt.pricePerPersonCents) : null,
});
const serializeRoom = (r: any) => ({
  ...r,
  pricePerNightCents: Number(r.pricePerNightCents),
  pricePerPersonCents: r.pricePerPersonCents != null ? Number(r.pricePerPersonCents) : null,
});
/** Every booking carries the moves the server will accept next, so the UI never offers a dead end. */
const serializeBooking = (b: any) => ({
  ...b,
  totalAmountCents: Number(b.totalAmountCents),
  allowedTransitions: HOTEL_BOOKING_TRANSITIONS[b.status] ?? [],
});
const serializeAllotment = (a: any, roomTypeNames: Map<string, string> = new Map()) => ({
  ...a,
  rateCents: Number(a.rateCents),
  roomTypeName: a.roomTypeId ? roomTypeNames.get(a.roomTypeId) ?? null : null,
  availableRooms: Math.max(0, a.totalRooms + (a.overbookBuffer ?? 0) - a.bookedRooms),
});

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
          // Only the caller's own rooms count towards its figures (shared hotels carry no rooms of theirs).
          rooms: { where: { tenantId }, select: { status: true, pricePerNightCents: true } },
          roomTypes: { select: { basePriceCents: true } },
        },
      }),
      this.prisma.hotel.count({ where }),
    ]);
    const enriched = items.map((h: any) => {
      const { rooms: _r, roomTypes: _rt, ...rest } = h;
      return { ...rest, ...this.roomFigures(h.rooms ?? []), isShared: h.tenantId === null, startingPriceCents: this.startingPrice(h) };
    });
    return { items: enriched, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /** Room figures from the rooms that exist: archived (INACTIVE) rooms are not inventory. */
  private roomFigures(rooms: { status: string }[]) {
    const live = rooms.filter((r) => r.status !== 'INACTIVE');
    const bookedRooms = live.filter((r) => r.status === 'OCCUPIED').length;
    return {
      totalRooms: live.length,
      bookedRooms,
      availableRooms: live.filter((r) => r.status === 'AVAILABLE').length,
      maintenanceRooms: live.filter((r) => r.status === 'MAINTENANCE').length,
      occupancy: live.length > 0 ? Math.round((bookedRooms / live.length) * 100) : 0,
    };
  }

  private startingPrice(h: any) {
    const prices = [
      ...(h.rooms ?? []).map((r: any) => Number(r.pricePerNightCents)),
      ...(h.roomTypes ?? []).map((rt: any) => Number(rt.basePriceCents)),
    ].filter((p) => p > 0);
    return prices.length ? Math.min(...prices) : 0;
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
    if (roomTypeId === undefined || roomTypeId === null || roomTypeId === '') return null;
    const safeId = requireId(roomTypeId, 'Room type');
    const rt = await this.prisma.roomType.findFirst({ where: { id: safeId, hotelId }, select: { id: true, occupancy: true } });
    if (!rt) throw new NotFoundException('Room type not found');
    return rt;
  }

  /** Recomputes the hotel's room counter from the rooms that actually exist. */
  private async syncHotelRoomCount(tenantId: string, hotelId: string) {
    const count = await this.prisma.room.count({ where: { hotelId, tenantId, status: { not: 'INACTIVE' } } });
    await this.prisma.hotel.updateMany({ where: { id: hotelId, tenantId }, data: { totalRooms: count } });
  }

  /** Bookings that still hold a room from today on (they block archiving). */
  private upcomingHolds(tenantId: string, where: Prisma.HotelBookingWhereInput) {
    return this.prisma.hotelBooking.count({
      where: { ...where, tenantId, status: { in: ROOM_HOLDING_STATUSES }, checkOut: { gt: startOfToday() } },
    });
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
    return {
      ...hotel,
      ...this.roomFigures(hotel.rooms ?? []),
      isShared: hotel.tenantId === null,
      roomTypes: hotel.roomTypes.map(serializeRoomType),
      rooms: (hotel.rooms ?? []).map(serializeRoom),
      allotments: hotel.allotments.map((a: any) => serializeAllotment(a)),
      hotelBookings: hotel.hotelBookings.map(serializeBooking),
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
        checkInTime: dto.checkInTime || undefined,
        checkOutTime: dto.checkOutTime || undefined,
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
    for (const k of ['nameAr', 'area', 'address', 'postalCode', 'amenities', 'images', 'description', 'contactPerson', 'phone', 'email', 'checkInTime', 'checkOutTime', 'cancellationPolicy', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    // Required columns: the DTO refuses empty values, so a present value is always usable.
    for (const k of ['name', 'city', 'country'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.status !== undefined && dto.status !== hotel.status) {
      if (dto.status === 'INACTIVE') await this.assertNoUpcomingStays(tenantId, hotel.id);
      data.status = dto.status;
    }
    if (dto.imageUrls !== undefined) data.images = dto.imageUrls;
    if (dto.starRating !== undefined) data.starRating = dto.starRating || null;
    if (dto.distanceToHaram !== undefined) data.distanceToHaram = dto.distanceToHaram != null ? Math.round(dto.distanceToHaram) : null;
    // totalRooms is server-owned (derived from rooms) and is ignored if sent.
    return this.prisma.hotel.update({ where: { id: hotel.id }, data });
  }

  private async assertNoUpcomingStays(tenantId: string, hotelId: string) {
    const holds = await this.upcomingHolds(tenantId, { hotelId });
    if (holds > 0) {
      throw new ConflictException(`This hotel has ${holds} upcoming booking(s); cancel or complete them before archiving it`);
    }
  }

  /** Archive: hides the hotel from active inventory. Its history stays readable. */
  async remove(tenantId: string, id: string) {
    const hotel = await this.ownedHotel(tenantId, id);
    await this.assertNoUpcomingStays(tenantId, hotel.id);
    return this.prisma.hotel.update({ where: { id: hotel.id }, data: { status: 'INACTIVE' } });
  }

  // ── Room types ─────────────────────────────────────────────────────────
  async getRoomTypes(tenantId: string, hotelId: string) {
    const hotel = await this.readableHotel(tenantId, hotelId);
    const [items, rooms] = await Promise.all([
      this.prisma.roomType.findMany({ where: { hotelId: hotel.id }, orderBy: { name: 'asc' } }),
      this.prisma.room.groupBy({
        by: ['roomTypeId'], where: { hotelId: hotel.id, tenantId, status: { not: 'INACTIVE' } }, _count: true,
      }),
    ]);
    const counts = new Map(rooms.map((r) => [r.roomTypeId, r._count]));
    return items.map((rt) => ({ ...serializeRoomType(rt), roomCount: counts.get(rt.id) ?? 0 }));
  }

  private async assertRoomTypeNameFree(hotelId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.roomType.findFirst({
      where: { hotelId, name: { equals: name.trim(), mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A room type called "${name.trim()}" already exists in this hotel`);
  }

  async addRoomType(tenantId: string, hotelId: string, dto: CreateRoomTypeDto) {
    const hotel = await this.ownedHotel(tenantId, hotelId);
    await this.assertRoomTypeNameFree(hotel.id, dto.name);
    const occupancyMap: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TWIN: 2, TRIPLE: 3, QUAD: 4, QUINTUPLE: 5, SUITE: 2 };
    const capacityNum = dto.capacity != null && dto.capacity !== '' && !isNaN(Number(dto.capacity)) ? Number(dto.capacity) : undefined;
    // An explicit number of guests wins over the default implied by the bed layout
    // (a "DOUBLE" set up for 3 pilgrims must keep 3).
    const occupancy = capacityNum
      ?? dto.maxOccupancy ?? dto.occupancy
      ?? occupancyMap[String(dto.capacity ?? dto.bedConfiguration ?? '').toUpperCase()]
      ?? 2;
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
    return { ...serializeRoomType(rt), roomCount: 0 };
  }

  async updateRoomType(tenantId: string, roomTypeId: string, dto: UpdateRoomTypeDto) {
    const existing = await this.ownedRoomType(tenantId, roomTypeId);
    if (dto.name !== undefined) await this.assertRoomTypeNameFree(existing.hotelId, dto.name, existing.id);
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
    return serializeRoomType(rt);
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  async getRooms(tenantId: string, hotelId: string) {
    const hotel = await this.readableHotel(tenantId, hotelId);
    const items = await this.prisma.room.findMany({
      where: { hotelId: hotel.id, tenantId },
      orderBy: { roomNumber: 'asc' },
      include: { roomType: { select: { id: true, name: true } } },
    });
    return items.map(serializeRoom);
  }

  private async assertRoomNumberFree(tenantId: string, hotelId: string, roomNumber: string, exceptId?: string) {
    const clash = await this.prisma.room.findFirst({
      where: {
        tenantId, hotelId, roomNumber: { equals: roomNumber.trim(), mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Room ${roomNumber.trim()} already exists in this hotel`);
  }

  private assertManualRoomStatus(status?: string) {
    if (status !== undefined && !ROOM_MANUAL_STATUSES.includes(status)) {
      throw new BadRequestException(
        `A room can be set to ${ROOM_MANUAL_STATUSES.join(', ')}; OCCUPIED follows guest check-in and check-out`,
      );
    }
  }

  async createRoom(tenantId: string, hotelId: string, dto: CreateRoomDto) {
    const hotel = await this.ownedHotel(tenantId, hotelId);
    const roomNumber = String(dto.roomNumber ?? dto.name ?? '').trim();
    if (!roomNumber) throw new BadRequestException('roomNumber is required');
    this.assertManualRoomStatus(dto.status);
    await this.assertRoomTypeInHotel(dto.roomTypeId, hotel.id);
    await this.assertRoomNumberFree(tenantId, hotel.id, roomNumber);
    const bedCount = dto.bedCount ?? 1;
    const availableBeds = dto.availableBeds ?? bedCount;
    if (availableBeds > bedCount) throw new BadRequestException('availableBeds cannot exceed bedCount');
    const room = await this.prisma.room.create({
      data: {
        tenantId,
        hotelId: hotel.id,
        roomTypeId: dto.roomTypeId || undefined,
        roomNumber,
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
    return serializeRoom(room);
  }

  /** Guards a manual status change: never over a checked-in guest, never archive a room with stays ahead. */
  private async assertRoomStatusChange(tenantId: string, room: { id: string; status: string; roomNumber: string }, next: string) {
    if (next === room.status) return;
    const inHouse = await this.prisma.hotelBooking.count({ where: { tenantId, roomId: room.id, status: 'CHECKED_IN' } });
    if (inHouse > 0) {
      throw new ConflictException(`A guest is checked in to room ${room.roomNumber}; check them out first`);
    }
    if (next === 'INACTIVE') {
      const holds = await this.upcomingHolds(tenantId, { roomId: room.id });
      if (holds > 0) {
        throw new ConflictException(`Room ${room.roomNumber} has ${holds} upcoming booking(s); move or cancel them before archiving it`);
      }
    }
  }

  async updateRoom(tenantId: string, roomId: string, dto: UpdateRoomDto) {
    const existing = await findOwned<{ id: string; hotelId: string; bedCount: number; availableBeds: number; status: string; roomNumber: string }>(
      this.prisma.room, roomId, tenantId, 'Room',
    );
    this.assertManualRoomStatus(dto.status);
    const data: any = {};
    for (const k of ['bedType', 'images', 'facilities', 'description', 'notes', 'capacity', 'bedCount', 'availableBeds'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.status !== undefined && dto.status !== existing.status) {
      await this.assertRoomStatusChange(tenantId, existing, dto.status);
      data.status = dto.status;
    }
    if (dto.seasonalPricing !== undefined) data.seasonalPricing = dto.seasonalPricing ?? [];
    if (dto.roomTypeId !== undefined) {
      await this.assertRoomTypeInHotel(dto.roomTypeId, existing.hotelId);
      data.roomTypeId = dto.roomTypeId || null;
    }
    if (dto.roomNumber !== undefined && dto.roomNumber !== null && !sameText(dto.roomNumber, existing.roomNumber)) {
      await this.assertRoomNumberFree(tenantId, existing.hotelId, dto.roomNumber, existing.id);
      data.roomNumber = String(dto.roomNumber).trim();
    }
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
    return serializeRoom(room);
  }

  /** Archive a room (it keeps its booking history). */
  async deleteRoom(tenantId: string, roomId: string) {
    const existing = await findOwned<{ id: string; hotelId: string; status: string; roomNumber: string }>(this.prisma.room, roomId, tenantId, 'Room');
    await this.assertRoomStatusChange(tenantId, existing, 'INACTIVE');
    const room = await this.prisma.room.update({ where: { id: existing.id }, data: { status: 'INACTIVE' } });
    await this.syncHotelRoomCount(tenantId, existing.hotelId);
    return serializeRoom(room);
  }

  /** Which of the hotel's rooms can take a stay: not archived, not held by an overlapping booking. */
  async roomAvailability(tenantId: string, hotelId: string, q: QueryRoomAvailabilityDto) {
    const hotel = await this.readableHotel(tenantId, hotelId);
    const checkIn = new Date(q.checkIn);
    const checkOut = new Date(q.checkOut);
    assertStayDates(checkIn, checkOut);
    const [rooms, clashes] = await Promise.all([
      this.prisma.room.findMany({
        where: { tenantId, hotelId: hotel.id, status: { not: 'INACTIVE' } },
        orderBy: { roomNumber: 'asc' },
        include: { roomType: { select: { id: true, name: true } } },
      }),
      this.prisma.hotelBooking.findMany({
        where: {
          tenantId, hotelId: hotel.id, roomId: { not: null }, status: { in: ROOM_HOLDING_STATUSES },
          checkIn: { lt: checkOut }, checkOut: { gt: checkIn },
          ...(q.excludeBookingId ? { id: { not: q.excludeBookingId } } : {}),
        },
        select: { roomId: true, checkIn: true, checkOut: true },
      }),
    ]);
    const held = new Map(clashes.map((c) => [c.roomId, c]));
    return rooms.map((r) => {
      const clash = held.get(r.id);
      return {
        id: r.id,
        roomNumber: r.roomNumber,
        floor: r.floor,
        capacity: r.capacity,
        status: r.status,
        roomType: r.roomType,
        pricePerNightCents: Number(r.pricePerNightCents),
        available: !clash,
        heldFrom: clash ? day(clash.checkIn) : null,
        heldUntil: clash ? day(clash.checkOut) : null,
      };
    });
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
    return this.withRoomNumbers(tenantId, items.map(serializeBooking));
  }

  private async withRoomNumbers<T extends { roomId?: string | null }>(tenantId: string, bookings: T[]) {
    const ids = [...new Set(bookings.map((b) => b.roomId).filter(Boolean))] as string[];
    if (!ids.length) return bookings.map((b) => ({ ...b, room: null }));
    const rooms = await this.prisma.room.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, roomNumber: true, status: true } });
    const byId = new Map(rooms.map((r) => [r.id, r]));
    return bookings.map((b) => ({ ...b, room: b.roomId ? byId.get(b.roomId) ?? null : null }));
  }

  async findHotelBooking(tenantId: string, id: string) {
    const b = await this.prisma.hotelBooking.findFirst({
      where: { id: requireId(id, 'Booking'), tenantId },
      include: { hotel: { select: { id: true, name: true, city: true } } },
    });
    if (!b) throw new NotFoundException('Booking not found');
    const [withRoom] = await this.withRoomNumbers(tenantId, [serializeBooking(b)]);
    return withRoom;
  }

  /**
   * Locks the room row and refuses a stay that overlaps another booking holding
   * the same room. Runs inside the write transaction, so two concurrent requests
   * cannot both take the room.
   */
  private async claimRoom(
    tx: Tx, tenantId: string, hotelId: string, roomId: string,
    stay: { checkIn: Date; checkOut: Date; guests?: number }, opts: { excludeBookingId?: string; checkingIn?: boolean } = {},
  ) {
    await tx.$queryRaw`SELECT id FROM plugin_hotel.rooms WHERE id = ${roomId}::uuid FOR UPDATE`;
    const room = await tx.room.findFirst({
      where: { id: roomId, tenantId, hotelId },
      select: { id: true, roomNumber: true, status: true, capacity: true, roomTypeId: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === 'INACTIVE') throw new ConflictException(`Room ${room.roomNumber} is archived`);
    if (opts.checkingIn && room.status === 'MAINTENANCE') throw new ConflictException(`Room ${room.roomNumber} is under maintenance`);
    if (stay.guests != null && stay.guests > room.capacity) {
      throw new BadRequestException(`Room ${room.roomNumber} sleeps ${room.capacity}; this booking has ${stay.guests} guests`);
    }
    const clash = await tx.hotelBooking.findFirst({
      where: {
        tenantId, roomId, status: { in: ROOM_HOLDING_STATUSES },
        checkIn: { lt: stay.checkOut }, checkOut: { gt: stay.checkIn },
        ...(opts.excludeBookingId ? { id: { not: opts.excludeBookingId } } : {}),
      },
      select: { checkIn: true, checkOut: true },
    });
    if (clash) {
      throw new ConflictException(`Room ${room.roomNumber} is already booked from ${day(clash.checkIn)} to ${day(clash.checkOut)}`);
    }
    return room;
  }

  /** Room occupancy is derived: OCCUPIED exactly while a checked-in booking holds the room. */
  private async syncRoomOccupancy(tx: Tx, tenantId: string, roomId: string | null | undefined) {
    if (!roomId) return;
    const [inHouse, room] = await Promise.all([
      tx.hotelBooking.count({ where: { tenantId, roomId, status: 'CHECKED_IN' } }),
      tx.room.findFirst({ where: { id: roomId, tenantId }, select: { status: true } }),
    ]);
    if (!room) return;
    if (inHouse > 0 && room.status !== 'OCCUPIED') {
      await tx.room.updateMany({ where: { id: roomId, tenantId }, data: { status: 'OCCUPIED' } });
    } else if (inHouse === 0 && room.status === 'OCCUPIED') {
      await tx.room.updateMany({ where: { id: roomId, tenantId }, data: { status: 'AVAILABLE' } });
    }
  }

  async createHotelBooking(tenantId: string, dto: CreateHotelBookingDto) {
    rejectClientPaymentStatus(dto.paymentStatus);
    const status = dto.status ?? 'PENDING';
    if (!HOTEL_BOOKING_INITIAL_STATUSES.includes(status)) {
      throw new BadRequestException(`A new booking starts as ${HOTEL_BOOKING_INITIAL_STATUSES.join(' or ')}; check-in and later stages are recorded on the booking`);
    }
    // Direct bookings may only be recorded against the caller's own, active hotels.
    const hotel = await this.ownedHotel(tenantId, dto.hotelId);
    if (hotel.status === 'INACTIVE') throw new ConflictException('This hotel is archived and cannot take bookings');
    const roomType = await this.assertRoomTypeInHotel(dto.roomTypeId, hotel.id);
    if (dto.customerUserId) await findOwned(this.prisma.user, dto.customerUserId, tenantId, 'Customer', {}, { id: true });
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    assertStayDates(checkIn, checkOut);
    const guests = dto.guests ?? 1;

    const booking = await this.prisma.$transaction(async (tx) => {
      if (dto.roomId) {
        requireId(dto.roomId, 'Room');
        const room = await this.claimRoom(tx, tenantId, hotel.id, dto.roomId, { checkIn, checkOut, guests });
        if (roomType && room.roomTypeId && room.roomTypeId !== roomType.id) {
          throw new BadRequestException(`Room ${room.roomNumber} is not of the selected room type`);
        }
      }
      return tx.hotelBooking.create({
        data: {
          tenantId,
          hotelId: hotel.id,
          roomTypeId: dto.roomTypeId || undefined,
          roomId: dto.roomId || undefined,
          customerUserId: dto.customerUserId || undefined,
          guestName: dto.guestName,
          guestEmail: dto.guestEmail || undefined,
          guestPhone: dto.guestPhone || undefined,
          guestNationality: dto.guestNationality || undefined,
          source: dto.source ?? 'EXTERNAL',
          checkIn,
          checkOut,
          guests,
          totalAmountCents: toCents(dto.amount, dto.totalAmountCents) ?? BigInt(0),
          currency: dto.currency ?? 'SAR',
          status,
          // Payment state belongs to the payments module; a booking always starts unpaid.
          paymentStatus: 'UNPAID',
          notes: dto.notes,
        },
      });
    });
    return this.findHotelBooking(tenantId, booking.id);
  }

  async updateHotelBooking(tenantId: string, id: string, dto: UpdateHotelBookingDto) {
    const existing: any = await this.findHotelBooking(tenantId, id);
    rejectClientPaymentStatus(dto.paymentStatus);

    if (HOTEL_BOOKING_TERMINAL_STATUSES.includes(existing.status)) {
      const changed = Object.entries(dto).filter(([k, v]) => v !== undefined && k !== 'notes').map(([k]) => k);
      if (changed.length) {
        throw new ConflictException(`This booking is ${existing.status}; only its notes can still change`);
      }
    }
    const nextStatus: string = dto.status ?? existing.status;
    if (dto.status !== undefined) assertHotelBookingTransition(existing.status, dto.status);

    const data: any = {};
    for (const k of ['guestName', 'guestPhone', 'guestNationality', 'notes', 'guests', 'source'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.status !== undefined && dto.status !== existing.status) data.status = dto.status;
    if (dto.guestEmail !== undefined) data.guestEmail = dto.guestEmail || null;
    if (dto.roomTypeId !== undefined) {
      await this.assertRoomTypeInHotel(dto.roomTypeId, existing.hotelId);
      data.roomTypeId = dto.roomTypeId || null;
    }
    if (dto.checkIn !== undefined) data.checkIn = new Date(dto.checkIn);
    if (dto.checkOut !== undefined) data.checkOut = new Date(dto.checkOut);
    const checkIn: Date = data.checkIn ?? new Date(existing.checkIn);
    const checkOut: Date = data.checkOut ?? new Date(existing.checkOut);
    if (data.checkIn || data.checkOut) assertStayDates(checkIn, checkOut);
    if (dto.totalAmountCents !== undefined || dto.amount !== undefined) {
      data.totalAmountCents = toCents(dto.amount, dto.totalAmountCents) ?? BigInt(0);
    }

    const previousRoomId: string | null = existing.roomId ?? null;
    let roomId: string | null = previousRoomId;
    if (dto.roomId !== undefined) {
      roomId = dto.roomId || null;
      if (roomId) requireId(roomId, 'Room');
      data.roomId = roomId;
    }
    if (nextStatus === 'CHECKED_IN' && !roomId) {
      throw new BadRequestException('Assign a room to this booking before checking the guest in');
    }
    if (['CHECKED_IN', 'CHECKED_OUT'].includes(existing.status) && dto.roomId !== undefined && !roomId) {
      throw new BadRequestException('A guest who has checked in keeps a room on the booking');
    }

    const holdsRoom = ROOM_HOLDING_STATUSES.includes(nextStatus);
    const roomChanged = roomId !== previousRoomId;
    const stayChanged = !!(data.checkIn || data.checkOut) || data.guests !== undefined;
    const checkingIn = nextStatus === 'CHECKED_IN' && existing.status !== 'CHECKED_IN';

    await this.prisma.$transaction(async (tx) => {
      if (roomId && holdsRoom && (roomChanged || stayChanged || checkingIn)) {
        await this.claimRoom(tx, tenantId, existing.hotelId, roomId,
          { checkIn, checkOut, guests: data.guests ?? existing.guests },
          { excludeBookingId: existing.id, checkingIn: nextStatus === 'CHECKED_IN' });
      }
      await tx.hotelBooking.update({ where: { id: existing.id }, data });
      // Room status follows the booking — only rooms of the caller's tenant are ever touched.
      await this.syncRoomOccupancy(tx, tenantId, roomId);
      if (roomChanged) await this.syncRoomOccupancy(tx, tenantId, previousRoomId);
    });
    return this.findHotelBooking(tenantId, existing.id);
  }

  // ── Allotments (operator contracts) ────────────────────────────────────
  private async roomTypeNames(hotelIds: string[]) {
    if (!hotelIds.length) return new Map<string, string>();
    const types = await this.prisma.roomType.findMany({ where: { hotelId: { in: hotelIds } }, select: { id: true, name: true } });
    return new Map(types.map((t) => [t.id, t.name]));
  }

  async getAllotments(tenantId: string, hotelId: string) {
    const allotments = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, orderBy: { checkIn: 'asc' } });
    const names = await this.roomTypeNames([hotelId]);
    return allotments.map((a) => serializeAllotment(a, names));
  }

  async createAllotment(tenantId: string, hotelId: string, dto: CreateAllotmentDto) {
    // Operators contract allotments on their own hotels or on shared marketplace hotels.
    const hotel = await this.readableHotel(tenantId, hotelId);
    if (hotel.status === 'INACTIVE') throw new ConflictException('This hotel is archived and cannot take new contracts');
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
    return serializeAllotment(allotment, await this.roomTypeNames([hotel.id]));
  }

  async updateAllotment(tenantId: string, allotmentId: string, dto: UpdateAllotmentDto) {
    const existing = await findOwned<{ id: string; hotelId: string; totalRooms: number; bookedRooms: number; overbookBuffer: number }>(
      this.prisma.allotment, allotmentId, tenantId, 'Allotment',
    );
    const totalRooms = dto.totalRooms ?? existing.totalRooms;
    const buffer = dto.overbookBuffer ?? existing.overbookBuffer;
    if (totalRooms + buffer < existing.bookedRooms) {
      throw new ConflictException(`${existing.bookedRooms} room(s) are already assigned from this allotment; release assignments before reducing it`);
    }
    const data: any = {};
    for (const k of ['contractType', 'totalRooms', 'overbookBuffer', 'currency', 'notes'] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.contractPrice !== undefined || dto.rateCents !== undefined) {
      data.rateCents = toCents(dto.contractPrice, dto.rateCents) ?? BigInt(0);
    }
    // Optimistic guard: the counter must not have moved past the new ceiling meanwhile.
    const updated = await this.prisma.allotment.updateMany({
      where: { id: existing.id, tenantId, bookedRooms: { lte: totalRooms + buffer } },
      data,
    });
    if (updated.count !== 1) throw new ConflictException('The allotment changed while you were editing it; reload and try again');
    const row = await this.prisma.allotment.findFirstOrThrow({ where: { id: existing.id, tenantId } });
    return serializeAllotment(row, await this.roomTypeNames([existing.hotelId]));
  }

  // ── Room assignments (operator bookings placed into an allotment) ──────
  async getAssignments(tenantId: string, hotelId: string) {
    const allotmentsForHotel = await this.prisma.allotment.findMany({ where: { tenantId, hotelId }, select: { id: true } });
    const allotmentIds = allotmentsForHotel.map((a) => a.id);
    const rows = await this.prisma.roomAssignment.findMany({
      where: { tenantId, allotmentId: { in: allotmentIds } }, orderBy: { checkIn: 'asc' },
    });
    const bookingIds = [...new Set(rows.map((r) => r.bookingId))];
    const bookings = bookingIds.length
      ? await this.prisma.booking.findMany({ where: { id: { in: bookingIds }, tenantId }, select: { id: true, bookingRef: true, status: true } })
      : [];
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    return rows.map((r) => ({
      ...r,
      pilgrimCount: Array.isArray(r.pilgrims) ? (r.pilgrims as unknown[]).length : 0,
      booking: bookingById.get(r.bookingId) ?? null,
    }));
  }

  async createAssignment(tenantId: string, hotelId: string, dto: CreateRoomAssignmentDto) {
    const safeHotelId = requireId(hotelId, 'Hotel');
    const allotment = await findOwned<{ id: string; totalRooms: number; bookedRooms: number; overbookBuffer: number; checkIn: Date; checkOut: Date; roomTypeId: string | null }>(
      this.prisma.allotment, dto.allotmentId, tenantId, 'Allotment', { hotelId: safeHotelId },
    );
    const booking = await findOwned<{ id: string; status: string; bookingRef: string }>(
      this.prisma.booking, dto.bookingId, tenantId, 'Booking', {}, { id: true, status: true, bookingRef: true },
    );
    if (['CANCELLED', 'REFUNDED'].includes(booking.status)) {
      throw new ConflictException(`Booking ${booking.bookingRef} is ${booking.status}; rooms cannot be assigned to it`);
    }
    const pilgrims = [...new Set(dto.pilgrims ?? [])];
    await assertAllOwned(this.prisma.pilgrim, pilgrims, tenantId, 'Pilgrim');
    if (pilgrims.length) {
      const onBooking = await this.prisma.bookingPilgrim.count({ where: { tenantId, bookingId: booking.id, pilgrimId: { in: pilgrims } } });
      if (onBooking !== pilgrims.length) {
        throw new BadRequestException(`Every pilgrim in the room must be a traveler on booking ${booking.bookingRef}`);
      }
      if (allotment.roomTypeId) {
        const rt = await this.prisma.roomType.findFirst({ where: { id: allotment.roomTypeId }, select: { occupancy: true, name: true } });
        if (rt && pilgrims.length > rt.occupancy) {
          throw new BadRequestException(`A ${rt.name} room sleeps ${rt.occupancy}; ${pilgrims.length} pilgrims were selected`);
        }
      }
    }
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
          bookingId: booking.id,
          checkIn,
          checkOut,
          roomNumber: dto.roomNumber,
          pilgrims,
          confirmedAt: new Date(),
        },
      });
    });
  }

  /** Releases an assignment and gives its room back to the allotment. */
  async deleteAssignment(tenantId: string, hotelId: string, assignmentId: string) {
    const safeHotelId = requireId(hotelId, 'Hotel');
    const existing = await findOwned<{ id: string; allotmentId: string }>(
      this.prisma.roomAssignment, assignmentId, tenantId, 'Room assignment', { allotment: { hotelId: safeHotelId } },
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.roomAssignment.delete({ where: { id: existing.id } });
      await tx.allotment.updateMany({
        where: { id: existing.allotmentId, tenantId, bookedRooms: { gt: 0 } },
        data: { bookedRooms: { decrement: 1 } },
      });
    });
    return { released: true, id: existing.id };
  }

  /** Contracted rooms (allotments) that cover a stay. */
  async checkAvailability(tenantId: string, query: QueryAvailabilityDto) {
    const where: Prisma.AllotmentWhereInput = { tenantId };
    if (query.hotelId) where.hotelId = query.hotelId;
    if (query.city) where.hotel = { city: { contains: query.city, mode: 'insensitive' } };
    if (query.checkIn) where.checkIn = { lte: new Date(query.checkIn) };
    if (query.checkOut) where.checkOut = { gte: new Date(query.checkOut) };
    if (query.checkIn && query.checkOut) assertStayDates(new Date(query.checkIn), new Date(query.checkOut));
    const allotments = await this.prisma.allotment.findMany({
      where,
      orderBy: { checkIn: 'asc' },
      include: { hotel: { select: { id: true, name: true, city: true, starRating: true } } },
    });
    const names = await this.roomTypeNames([...new Set(allotments.map((a) => a.hotelId))]);
    return allotments.map((a) => serializeAllotment(a, names));
  }

  // ── Hotel Owner dashboard stats ────────────────────────────────────────
  async getStats(tenantId: string) {
    const today = startOfToday();
    const in7days = new Date(today);
    in7days.setUTCDate(in7days.getUTCDate() + 7);

    const [
      ownHotels, activeHotels, sharedHotels, totalRoomTypes, allRooms,
      hotelBookings, upcomingCheckIns, upcomingCheckOuts,
    ] = await Promise.all([
      this.prisma.hotel.count({ where: { tenantId } }),
      this.prisma.hotel.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.hotel.count({ where: { tenantId: null } }),
      this.prisma.roomType.count({ where: { hotel: { tenantId } } }),
      this.prisma.room.findMany({ where: { tenantId }, select: { status: true } }),
      this.prisma.hotelBooking.findMany({
        where: { tenantId },
        select: { status: true, paymentStatus: true, totalAmountCents: true },
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

    const rooms = this.roomFigures(allRooms);
    // Payment state is written by the payments module; these sums only read it.
    const recordedPaid = hotelBookings
      .filter((b) => b.paymentStatus === 'PAID')
      .reduce((sum, b) => sum + Number(b.totalAmountCents), 0);
    const outstanding = hotelBookings
      .filter((b) => ['UNPAID', 'PARTIAL'].includes(b.paymentStatus) && b.status !== 'CANCELLED')
      .reduce((sum, b) => sum + Number(b.totalAmountCents), 0);

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
      hotels: { total: ownHotels, active: activeHotels, shared: sharedHotels },
      rooms: {
        total: rooms.totalRooms, roomTypes: totalRoomTypes, available: rooms.availableRooms,
        booked: rooms.bookedRooms, maintenance: rooms.maintenanceRooms,
      },
      occupancyRate: rooms.occupancy,
      revenue: { collectedCents: recordedPaid, outstandingCents: outstanding, currency: 'SAR' },
      bookings: {
        total: hotelBookings.length,
        pending: hotelBookings.filter((b) => b.status === 'PENDING').length,
        confirmed: hotelBookings.filter((b) => b.status === 'CONFIRMED').length,
        checkedIn: hotelBookings.filter((b) => b.status === 'CHECKED_IN').length,
      },
      upcomingCheckIns: upcomingCheckIns.map((b: any) => ({ id: b.id, guestName: b.guestName, hotel: b.hotel?.name, checkIn: b.checkIn, status: b.status })),
      upcomingCheckOuts: upcomingCheckOuts.map((b: any) => ({ id: b.id, guestName: b.guestName, hotel: b.hotel?.name, checkOut: b.checkOut, status: b.status })),
      marketplace: { activeListings, recentInquiries: recentInquiries.map((i: any) => ({ id: i.id, listingName: i.listing?.name, fromName: i.fromName, status: i.status, createdAt: i.createdAt })) },
    };
  }
}
