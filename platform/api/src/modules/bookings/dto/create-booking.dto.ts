import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
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

export class BookingPilgrimAssignmentDto {
  @ApiProperty()
  @IsUUID()
  pilgrimId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priceOverride?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mealPreference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @IsUUID(undefined, { each: true })
  pilgrimIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Total in major units (SAR)' })
  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @ApiPropertyOptional({ description: 'Total in cents — alternative to totalAmount' })
  @IsOptional()
  @IsNumber()
  totalAmountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  depositAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  balanceDue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  paxAdult?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  paxChild?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  paxInfant?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [BookingPilgrimAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BookingPilgrimAssignmentDto)
  pilgrims?: BookingPilgrimAssignmentDto[];
}
