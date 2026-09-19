import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { MovementType, TransportType } from '@prisma/client';

/*
 * Request contracts for /transport. Every field the web client and the audit scripts send is
 * listed here (the global ValidationPipe rejects unknown keys). Server-owned values —
 * tenantId, bookedSeats — are never taken from the client.
 */

export const VEHICLE_STATUSES = ['AVAILABLE', 'BOOKED', 'IN_SERVICE', 'UNDER_MAINTENANCE', 'INACTIVE'] as const;
export const DRIVER_STATUSES = ['AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'OFF_DUTY', 'INACTIVE'] as const;
export const ROUTE_STATUSES = ['DRAFT', 'ACTIVE', 'FULLY_BOOKED', 'COMPLETED', 'CANCELLED', 'INACTIVE'] as const;
export const ASSIGNMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export const CUSTOMER_TYPES = ['PLATFORM_USER', 'OPERATOR', 'EXTERNAL'] as const;

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
/** '' from a cleared form field means "no value". */
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const MAX_MONEY_MAJOR = 100_000_000;
const MAX_MONEY_CENTS = MAX_MONEY_MAJOR * 100;
const DATE_ONLY_OR_ISO = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

// ── Vehicles ─────────────────────────────────────────────────────────────
class VehicleFieldsDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) brand?: string;
  /** Alias of brand. */
  @IsOptional() @IsString() @MaxLength(100) make?: string;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) year?: number | null;
  /** Accepted for client compatibility; not stored. */
  @IsOptional() @IsString() @MaxLength(50) color?: string;
  @IsOptional() @IsString() @MaxLength(50) registrationNumber?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) luggageCapacity?: number | null;
  @IsOptional() @IsBoolean() hasAc?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) features?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) imageUrls?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) documentUrls?: string[];
  @IsOptional() @Transform(upper) @IsIn(VEHICLE_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateVehicleDto extends VehicleFieldsDto {
  /** TransportType or an alias (BUS, COACH, SEDAN, SUV, …) — normalized by the service. */
  @IsString() @MaxLength(30) type!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) plateNumber!: string;
  @IsInt() @Min(1) @Max(100) capacity!: number;
  @IsOptional() @IsBoolean() licensedForHajj?: boolean;
  @IsOptional() @IsString() @MaxLength(50) saudiLicenseNo?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true }) amenities?: string[];
}

export class UpdateVehicleDto extends VehicleFieldsDto {
  @IsOptional() @IsString() @MaxLength(30) type?: string;
  @IsOptional() @IsString() @MaxLength(30) plateNumber?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AssignDriverDto {
  @IsUUID() driverId!: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}

// ── Drivers ──────────────────────────────────────────────────────────────
class DriverFieldsDto {
  @IsOptional() @Transform(emptyToNull) @IsEmail() @MaxLength(255) email?: string | null;
  @IsOptional() @Transform((p) => (p.value === '' ? null : upper(p))) @Matches(/^[A-Z]{2}$/, { message: 'nationality must be a 2-letter country code' }) nationality?: string | null;
  @IsOptional() @IsString() @MaxLength(50) idNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) licenseNumber?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() licenseExpiry?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(10, { each: true }) languages?: string[];
  @IsOptional() @IsString() @MaxLength(2048) photoUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(2048, { each: true }) documentUrls?: string[];
  @IsOptional() @Transform(upper) @IsIn(DRIVER_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateDriverDto extends DriverFieldsDto {
  @IsString() @IsNotEmpty() @MaxLength(100) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) phone!: string;
}

export class UpdateDriverDto extends DriverFieldsDto {
  /** Required on the record: an empty value is refused rather than silently ignored. */
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Routes ───────────────────────────────────────────────────────────────
class RouteFieldsDto {
  @IsOptional() @IsEnum(MovementType) movementType?: MovementType;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) originCity?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) destCity?: string;
  @IsOptional() @IsString() @MaxLength(255) pickupPoint?: string;
  @IsOptional() @IsString() @MaxLength(255) dropoffPoint?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) distanceKm?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) durationMins?: number | null;
  /** ISO date-time or a datetime-local value ('YYYY-MM-DDTHH:mm'); '' clears it. */
  @IsOptional() @Transform(emptyToNull) @Matches(DATE_ONLY_OR_ISO, { message: 'departureAt must be a date-time' }) departureAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @Matches(DATE_ONLY_OR_ISO, { message: 'arrivalAt must be a date-time' }) arrivalAt?: string | null;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerSeat?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) pricePerSeatCents?: number | null;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerVehicle?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) pricePerVehicleCents?: number | null;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) totalSeats?: number | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() vehicleId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() driverId?: string | null;
  @IsOptional() @Transform(upper) @IsIn(ROUTE_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateRouteDto extends RouteFieldsDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  /** Alias of movementType. */
  @IsOptional() @IsEnum(MovementType) type?: MovementType;
  /** Aliases of originCity / destCity. */
  @IsOptional() @IsString() @MaxLength(100) origin?: string;
  @IsOptional() @IsString() @MaxLength(100) destination?: string;
  /** Alias of durationMins. */
  @IsOptional() @IsInt() @Min(0) @Max(10_000) estimatedDuration?: number;
  /** Alias of pricePerSeat (major units). */
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) pricePerPax?: number;
}

export class UpdateRouteDto extends RouteFieldsDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  /** Sent by the edit form; accepted but IGNORED — seat counters are maintained by assignments. */
  @IsOptional() @IsInt() @Min(0) bookedSeats?: number;
}

// ── Assignments / bookings ───────────────────────────────────────────────
class AssignmentFieldsDto {
  @IsOptional() @Transform(emptyToNull) @IsUUID() driverId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() routeId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() bookingId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsUUID() groupId?: string | null;
  @IsOptional() @Transform(upper) @IsIn(CUSTOMER_TYPES) customerType?: string;
  @IsOptional() @IsString() @MaxLength(200) customerName?: string;
  @IsOptional() @Transform(emptyToNull) @IsEmail() @MaxLength(255) customerEmail?: string | null;
  @IsOptional() @IsString() @MaxLength(40) customerPhone?: string;
  @IsOptional() @IsString() @MaxLength(255) pickupLocation?: string;
  @IsOptional() @IsString() @MaxLength(255) dropoffLocation?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) passengerCount?: number;
  /** Pilgrim ids of the caller's organization. */
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) pilgrims?: string[];
  /** Price in major units (SAR). */
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_MONEY_MAJOR) price?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_MONEY_CENTS) priceCents?: number;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }) currency?: string;
  @IsOptional() @Transform(upper) @IsIn(ASSIGNMENT_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateAssignmentDto extends AssignmentFieldsDto {
  @IsUUID() vehicleId!: string;
  @IsOptional() @Transform(emptyToNull) @IsUUID() tripGroupId?: string | null;
  @IsDateString() scheduledAt!: string;
  /** Alias of passengerCount. */
  @IsOptional() @IsInt() @Min(1) @Max(500) passengers?: number;
}

export class UpdateAssignmentDto extends AssignmentFieldsDto {
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @Transform(emptyToNull) @IsDateString() departedAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsDateString() arrivedAt?: string | null;
}

// ── Tasreeh ──────────────────────────────────────────────────────────────
export class CreateTasreehDto {
  @IsUUID() vehicleId!: string;
  @IsString() @IsNotEmpty() @MaxLength(50) permitNumber!: string;
  @IsOptional() @IsDateString() issueDate?: string;
  /** Alias of issueDate. */
  @IsOptional() @IsDateString() permitDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  /** Alias of expiryDate. */
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @Transform(upper) @IsString() @MaxLength(50) zone?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(50, { each: true }) zones?: string[];
  @IsOptional() @IsString() @MaxLength(2048) documentUrl?: string;
}

export class QueryRoutesDto {
  @IsOptional() @Transform(upper) @IsIn(ROUTE_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 50;
}

export class QueryAssignmentsDto {
  @IsOptional() @Transform(upper) @IsIn(ASSIGNMENT_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 50;
}

export class QueryTransportDto {
  @IsOptional() @IsString() @MaxLength(30) status?: string;
  @IsOptional() @Transform(upper) @IsEnum(TransportType) type?: TransportType;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 20;
}
