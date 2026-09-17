import {
  Allow,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

/** Trims strings and turns blank strings into `undefined` so optional validators skip them. */
export const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
export const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export const MAX_PARTY_SIZE = 500;

/** Statuses of a listing booking. PAID / REFUNDED are owned by the payments module. */
export const LISTING_BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'PAID', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as const;
export const INQUIRY_RESPONSE_STATUSES = ['RESPONDED', 'CONVERTED', 'CLOSED'] as const;
export const LISTING_STATUSES = ['DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'] as const;
export const PRICING_MODELS = ['PER_PERSON', 'PER_GROUP', 'PER_NIGHT', 'PER_TRIP', 'FLAT'] as const;

// ── Listing inquiries ────────────────────────────────────────────────────────
export class CreateListingInquiryDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  fromName?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(255)
  email?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(255)
  fromEmail?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  fromPhone?: string;

  @ApiProperty() @Transform(blankToUndefined) @IsString() @IsNotEmpty() @MaxLength(5000)
  message: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PARTY_SIZE)
  partySize?: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  startDate?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  endDate?: string;
}

export class RespondInquiryDto {
  @ApiProperty() @Transform(blankToUndefined) @IsString() @IsNotEmpty() @MaxLength(5000)
  response: string;

  @ApiPropertyOptional({ enum: INQUIRY_RESPONSE_STATUSES })
  @Transform(upper) @IsOptional() @IsIn(INQUIRY_RESPONSE_STATUSES as unknown as string[])
  status?: string;
}

// ── Listing bookings ─────────────────────────────────────────────────────────
export class CreateListingBookingDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  customerName?: string;

  @ApiPropertyOptional({ description: 'Alias of customerName' })
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(255)
  customerEmail?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(255)
  email?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  startDate?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PARTY_SIZE)
  partySize?: number;

  @ApiPropertyOptional({ description: 'Client estimate only. The server computes the total; a mismatch is rejected.' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  totalAmountCents?: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class UpdateListingBookingDto {
  @ApiPropertyOptional({ enum: LISTING_BOOKING_STATUSES })
  @Transform(upper) @IsOptional() @IsIn(LISTING_BOOKING_STATUSES as unknown as string[])
  status?: string;

  /** Whitelisted only so the server can refuse it explicitly — payment state comes from the payments module. */
  @ApiPropertyOptional({ deprecated: true }) @Allow()
  paymentStatus?: unknown;

  /** Whitelisted only so the server can refuse it explicitly — totals are computed server-side. */
  @ApiPropertyOptional({ deprecated: true }) @Allow()
  totalAmountCents?: unknown;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  customerName?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() @MaxLength(255)
  customerEmail?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(40)
  customerPhone?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  startDate?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  endDate?: string;
}

// ── Vendor ratings ───────────────────────────────────────────────────────────
export class RateVendorDto {
  @ApiProperty({ minimum: 1, maximum: 5 }) @Type(() => Number) @IsInt() @Min(1) @Max(5)
  rating: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ description: 'Informational; verification is derived server-side' })
  @Transform(blankToUndefined) @IsOptional() @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Accepted for compatibility; not stored' })
  @IsOptional() @IsBoolean()
  isAnonymous?: boolean;
}
