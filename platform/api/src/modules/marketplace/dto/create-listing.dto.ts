import { RawJson } from '../../../common/decorators/raw-json.decorator';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TenantType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { blankToUndefined, PRICING_MODELS, upper } from './marketplace.dto';
import { MAX_LISTING_IMAGES } from '../../storage/media-registry.service';

export enum ListingCategory {
  HOTEL_ROOM = 'hotel_room',
  TRANSPORT_SERVICE = 'transport_service',
  GUIDE_SERVICE = 'guide_service',
  VISA_SERVICE = 'visa_service',
  CATERING = 'catering',
  OTHER = 'other',
}

/** Legacy lower-case pricing unit; `pricingModel` is the canonical field. */
export enum PriceUnit {
  PER_PERSON = 'per_person',
  PER_NIGHT = 'per_night',
  PER_TRIP = 'per_trip',
  FLAT = 'flat',
}

/** Upper bound for a listing price: 100 million major units, in minor units (cents). */
export const MAX_PRICE_CENTS = 10_000_000_000;

export class CreateListingDto {
  @ApiProperty()
  @Transform(blankToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @IsOptional()
  @MaxLength(255)
  titleAr?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @ApiProperty({ enum: ListingCategory })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiPropertyOptional({ description: 'Price in minor units (cents). 0 or omitted = "contact for pricing".' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  @IsOptional()
  priceCents?: number;

  @ApiPropertyOptional({ description: 'Legacy: price in MAJOR units (e.g. SAR). Prefer priceCents.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  priceFrom?: number;

  @ApiPropertyOptional({ example: 'SAR' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code such as SAR' })
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ enum: PRICING_MODELS })
  @Transform(upper)
  @IsIn(PRICING_MODELS as unknown as string[])
  @IsOptional()
  pricingModel?: string;

  @ApiPropertyOptional({ enum: PriceUnit, description: 'Legacy alias of pricingModel' })
  @IsEnum(PriceUnit)
  @IsOptional()
  unit?: PriceUnit;

  @ApiPropertyOptional({ description: 'Images uploaded through POST /uploads; the first is the cover.' })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(2048, { each: true })
  @ArrayMaxSize(MAX_LISTING_IMAGES)
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  maxCapacity?: number;

  @ApiPropertyOptional({ description: "One of the caller organization's seller profiles; defaults to its first one" })
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsEnum(TenantType)
  @IsOptional()
  vendorType?: TenantType;

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], description: 'Defaults to PUBLISHED' })
  @Transform(upper)
  @IsIn(['DRAFT', 'PUBLISHED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Category details (roomType, vehicleType…): flat values only' })
  @IsObject()
  @RawJson()
  @IsOptional()
  attributes?: Record<string, any>;
}
