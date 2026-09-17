import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsDateString, IsUUID, IsObject, MaxLength, Min, Max, ArrayMaxSize } from 'class-validator';
import { TenantType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum ListingCategory {
  HOTEL_ROOM = 'hotel_room',
  TRANSPORT_SERVICE = 'transport_service',
  GUIDE_SERVICE = 'guide_service',
  VISA_SERVICE = 'visa_service',
  CATERING = 'catering',
  OTHER = 'other',
}

export enum PriceUnit {
  PER_PERSON = 'per_person',
  PER_NIGHT = 'per_night',
  PER_TRIP = 'per_trip',
  FLAT = 'flat',
}

export class CreateListingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  titleAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  descriptionAr?: string;

  @ApiProperty({ enum: ListingCategory })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  @Type(() => Number)
  priceFrom?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  @Type(() => Number)
  priceTo?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: PriceUnit })
  @IsEnum(PriceUnit)
  @IsOptional()
  unit?: PriceUnit;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @ArrayMaxSize(50)
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @ArrayMaxSize(50)
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  availableFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  availableTo?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  @Type(() => Number)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'If omitted, resolved from the requesting tenant' })
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsEnum(TenantType)
  @IsOptional()
  vendorType?: TenantType;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @ArrayMaxSize(50)
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: 'Category-specific structured data (roomType, vehicleType, etc.)' })
  @IsObject() @RawJson()
  @IsOptional()
  attributes?: Record<string, any>;
}
