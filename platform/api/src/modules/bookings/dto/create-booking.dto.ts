import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsArray,
  IsInt,
  IsDateString,
  IsIn,
  Length,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum BookingStatus {
  DRAFT = 'DRAFT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  VISA_PROCESSING = 'VISA_PROCESSING',
  TRAVELING = 'TRAVELING',
  REFUNDED = 'REFUNDED',
  ENQUIRY = 'ENQUIRY',
  CONFIRMED = 'CONFIRMED',
  
  FULLY_PAID = 'FULLY_PAID',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

/** Statuses a booking may be created in (matches the web "New booking" form). */
export const INITIAL_BOOKING_STATUSES = [
  'DRAFT', 'ENQUIRY', 'INQUIRY', 'CONFIRMED', 'PARTIALLY_PAID', 'FULLY_PAID', 'VISA_PROCESSING',
] as const;

export class BookingPilgrimAssignmentDto {
  @ApiProperty()
  @IsUUID()
  pilgrimId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceOverride?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  mealPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  seatNumber?: string;
}

export class CreateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  packageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadPilgrimId?: string;

  // Alias accepted from web/mobile clients — mapped to leadPilgrimId in service
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pilgrimId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  pilgrimIds?: string[];

  /** Accepted for client compatibility; ignored by the service. */
  @ApiPropertyOptional({ description: 'Ignored (accepted for client compatibility)' })
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  /**
   * Initial status. Only statuses a new booking can legitimately start in are
   * accepted; later lifecycle states go through PUT /bookings/:id/status.
   */
  @ApiPropertyOptional({ enum: INITIAL_BOOKING_STATUSES })
  @IsOptional()
  @IsIn(INITIAL_BOOKING_STATUSES as unknown as string[], {
    message: `status must be one of: ${INITIAL_BOOKING_STATUSES.join(', ')}`,
  })
  status?: string;

  @ApiPropertyOptional({ description: 'Total in major units (SAR)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Total in cents — alternative to totalAmount' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000_000)
  totalAmountCents?: number;

  @ApiPropertyOptional({ description: 'Deposit already paid, major units (SAR); must not exceed the total' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000_000)
  depositAmount?: number;

  /** Accepted for client compatibility; ignored (balance is derived server-side). */
  @ApiPropertyOptional({ description: 'Ignored — derived server-side' })
  @IsOptional()
  @IsNumber()
  balanceDue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  departureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  paxAdult?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  paxChild?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(500)
  paxInfant?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @ApiPropertyOptional({ type: [BookingPilgrimAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BookingPilgrimAssignmentDto)
  pilgrims?: BookingPilgrimAssignmentDto[];
}
