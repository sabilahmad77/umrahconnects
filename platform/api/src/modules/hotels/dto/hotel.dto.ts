import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID,
  IsNotEmpty, IsObject, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { HotelContractType } from '@prisma/client';

/*
 * Request contracts for /hotels. Every field the web client and the audit scripts send is
 * listed here (the global ValidationPipe rejects unknown keys). Server-owned values —
 * tenantId, bookedRooms, hotel totalRooms — are never taken from the client.
 */

export const HOTEL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] as const;
export const ROOM_TYPE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const ROOM_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'INACTIVE'] as const;
export const HOTEL_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED'] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export const HOTEL_BOOKING_SOURCES = ['PLATFORM_USER', 'EXTERNAL', 'OPERATOR', 'MARKETPLACE'] as const;

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const toStr = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value);
const toTrimmedStr = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value;
/** '' from a cleared form field means "no value". */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** 24-hour clock time such as 15:00. */
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MONEY_MAJOR = 100_000_000; // 100M in major units
const MAX_MONEY_CENTS = MAX_MONEY_MAJOR * 100;

// ── Hotels ───────────────────────────────────────────────────────────────
export class QueryHotelDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @Transform(upper) @IsIn(HOTEL_STATUSES) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) starRating?: number;
}

class HotelFieldsDto {
  @IsOptional() @IsString() @MaxLength(255) nameAr?: string;
  /** Required on the record: an empty value is refused rather than silently ignored. */
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) city?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO code such as SA' }) country?: string;
  @IsOptional() @IsString() @MaxLength(120) area?: string;
  @IsOptional() @IsString() @MaxLength(1000) address?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) distanceToHaram?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) amenities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) images?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) imageUrls?: string[];
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsString() @MaxLength(150) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @Transform(emptyToNull) @IsEmail() @MaxLength(255) email?: string | null;
  @IsOptional() @Transform(emptyToNull) @Matches(HH_MM, { message: 'checkInTime must be a 24-hour time such as 15:00' }) checkInTime?: string | null;
  @IsOptional() @Transform(emptyToNull) @Matches(HH_MM, { message: 'checkOutTime must be a 24-hour time such as 12:00' }) checkOutTime?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) cancellationPolicy?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @Transform(upper) @IsIn(HOTEL_STATUSES) status?: string;
  /** Accepted for client compatibility but IGNORED: the room counter is derived from rooms. */
  @IsOptional() @IsInt() @Min(0) totalRooms?: number;
}

export class CreateHotelDto extends HotelFieldsDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(255) name!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) starRating?: number;
  /** Alias used by the audit scripts. */
  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000) distanceFromHaram?: number;
}

export class UpdateHotelDto extends HotelFieldsDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(255) name?: string;
  /** The edit form sends 0 when the rating is cleared. */
  @IsOptional() @IsInt() @Min(0) @Max(5) starRating?: number | null;
}

// ── Room types ───────────────────────────────────────────────────────────
class RoomTypeFieldsDto {
  @IsOptional() @IsString() @MaxLength(50) bedConfig?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) basePrice?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) basePriceCents?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerPerson?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) pricePerPersonCents?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) totalCount?: number;
  @IsOptional() @Transform(upper) @IsIn(ROOM_TYPE_STATUSES) status?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) amenities?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) images?: string[];
}

export class CreateRoomTypeDto extends RoomTypeFieldsDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  /** Either a number of guests (e.g. 4) or a label such as DOUBLE / TRIPLE. */
  @IsOptional() @Transform(({ value }) => (value == null ? value : String(value).trim().toUpperCase()))
  @IsString() @Matches(/^(\d{1,2}|SINGLE|DOUBLE|TWIN|TRIPLE|QUAD|QUINTUPLE|SUITE)$/, { message: 'capacity must be a number or SINGLE/DOUBLE/TWIN/TRIPLE/QUAD/QUINTUPLE/SUITE' })
  capacity?: string;
  @IsOptional() @Transform(upper) @IsIn(['SINGLE', 'DOUBLE', 'TWIN', 'TRIPLE', 'QUAD', 'QUINTUPLE', 'SUITE']) bedConfiguration?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxOccupancy?: number;
  @IsOptional() @IsInt() @Min(1) @Max(20) occupancy?: number;
}

export class UpdateRoomTypeDto extends RoomTypeFieldsDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) occupancy?: number;
}

// ── Rooms ────────────────────────────────────────────────────────────────
class RoomFieldsDto {
  @IsOptional() @Transform(toStr) @IsString() @MaxLength(20) floor?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(50) capacity?: number;
  @IsOptional() @IsString() @MaxLength(40) bedType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(50) bedCount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(50) availableBeds?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerNight?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) pricePerNightCents?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerPerson?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) pricePerPersonCents?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsObject({ each: true }) seasonalPricing?: Record<string, unknown>[] | null;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) images?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) facilities?: string[];
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @Transform(upper) @IsIn(ROOM_STATUSES) status?: string;
}

export class CreateRoomDto extends RoomFieldsDto {
  /** Required (or `name`): the service refuses a room without a number. */
  @IsOptional() @Transform(toStr) @IsString() @MaxLength(40) roomNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) name?: string;
  @IsOptional() @Transform(emptyToNull) @IsUUID() roomTypeId?: string | null;
}

export class UpdateRoomDto extends RoomFieldsDto {
  @IsOptional() @Transform(toTrimmedStr) @IsString() @IsNotEmpty() @MaxLength(40) roomNumber?: string;
  /** null / '' detaches the room from its type. */
  @IsOptional() @Transform(emptyToNull) @IsUUID() roomTypeId?: string | null;
}

// ── Hotel bookings ───────────────────────────────────────────────────────
class HotelBookingFieldsDto {
  @IsOptional() @Transform(emptyToNull) @IsUUID() roomTypeId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() roomId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) guestPhone?: string;
  @IsOptional() @Transform((p) => (p.value === '' ? null : upper(p))) @Matches(/^[A-Z]{2}$/, { message: 'guestNationality must be a 2-letter country code' }) guestNationality?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsEmail() @MaxLength(255) guestEmail?: string | null;
  @IsOptional() @Transform(upper) @IsIn(HOTEL_BOOKING_SOURCES) source?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) guests?: number;
  /** Amount in major units (SAR). */
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) amount?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) totalAmountCents?: number;
  @IsOptional() @Transform(upper) @IsIn(HOTEL_BOOKING_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateHotelBookingDto extends HotelBookingFieldsDto {
  @IsUUID() hotelId!: string;
  @IsOptional() @IsUUID() customerUserId?: string;
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'guestName is required' }) @MaxLength(200) guestName!: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
}

export class UpdateHotelBookingDto extends HotelBookingFieldsDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) guestName?: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
}

// ── Allotments & room assignments ────────────────────────────────────────
export class CreateAllotmentDto {
  @IsOptional() @Transform(emptyToNull) @IsUUID() roomTypeId?: string | null;
  @IsOptional() @Transform(upper) @IsIn(Object.values(HotelContractType)) contractType?: HotelContractType;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsInt() @Min(1) @Max(100_000) totalRooms!: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) overbookBuffer?: number;
  /** Rate per room per night in major units. */
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) contractPrice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) rateCents?: number;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
  @IsOptional() @IsString() @MaxLength(200) contractRef?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

/** Adjusts a contract. Dates are fixed once rooms are assigned against them; bookedRooms is server-owned. */
export class UpdateAllotmentDto {
  @IsOptional() @Transform(upper) @IsIn(Object.values(HotelContractType)) contractType?: HotelContractType;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) totalRooms?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) overbookBuffer?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) contractPrice?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) rateCents?: number;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

/** GET /hotels/availability — contracted rooms that cover a stay. */
export class QueryAvailabilityDto {
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsUUID() hotelId?: string;
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
}

/** GET /hotels/:id/room-availability — which rooms are free for a stay. */
export class QueryRoomAvailabilityDto {
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  /** Leave this booking out of the clash check (used when editing it). */
  @IsOptional() @IsUUID() excludeBookingId?: string;
}

export class CreateRoomAssignmentDto {
  @IsUUID() allotmentId!: string;
  @IsUUID() bookingId!: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @Transform(toStr) @IsString() @MaxLength(20) roomNumber?: string;
  /** Pilgrim ids of the caller's organization. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) pilgrims?: string[];
}
