import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsBoolean, IsDateString } from 'class-validator';
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
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  titleAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descriptionAr?: string;

  @ApiProperty({ enum: ListingCategory })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  priceFrom?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  priceTo?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PriceUnit })
  @IsEnum(PriceUnit)
  @IsOptional()
  unit?: PriceUnit;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
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
  @IsOptional()
  @Type(() => Number)
  maxCapacity?: number;

  @ApiPropertyOptional({ description: 'If omitted, resolved from the requesting tenant' })
  @IsString()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  vendorType?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Category-specific structured data (roomType, vehicleType, etc.)' })
  @IsOptional()
  attributes?: Record<string, any>;
}
