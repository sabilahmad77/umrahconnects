import { RawJson } from '../../../common/decorators/raw-json.decorator';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { RequestServiceType } from '@prisma/client';

const blankToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? undefined : t;
};
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

const MAX_CENTS = 10_000_000_000; // 100M major units

export class CreateMarketplaceRequestDto {
  @ApiPropertyOptional({ enum: RequestServiceType })
  @Transform(upper) @IsOptional() @IsEnum(RequestServiceType)
  serviceType?: RequestServiceType;

  @ApiPropertyOptional({ enum: RequestServiceType, description: 'Legacy alias of serviceType' })
  @Transform(upper) @IsOptional() @IsEnum(RequestServiceType)
  category?: RequestServiceType;

  @ApiProperty() @Transform(blankToUndefined) @IsString() @IsNotEmpty() @MaxLength(200)
  title: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  travelers?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_CENTS)
  budgetMinCents?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(MAX_CENTS)
  budgetMaxCents?: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional() @IsOptional() @IsObject() @RawJson()
  requirements?: Record<string, unknown>;
}

export class CreateOfferDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(1) @Max(MAX_CENTS)
  priceCents: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ description: "Must be one of the caller organization's vendors" })
  @Transform(blankToUndefined) @IsOptional() @IsUUID()
  vendorId?: string;
}

export class ConvertOfferDto {
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsUUID()
  routeId?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  passengerCount?: number;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsUUID()
  listingId?: string;
}
