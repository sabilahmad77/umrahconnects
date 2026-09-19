import { RawJson } from '../../../common/decorators/raw-json.decorator';
import {
  IsDateString,
  IsInt,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { blankToUndefined, upper } from './marketplace.dto';
import { MAX_PRICE_CENTS } from './create-listing.dto';

/** An organization asks the seller of a listing for a price. */
export class CreateQuoteDto {
  @ApiProperty()
  @IsUUID()
  listingId: string;

  @ApiPropertyOptional({ description: "Must be the listing's seller when given" })
  @IsUUID()
  @IsOptional()
  vendorId?: string;

  @ApiPropertyOptional({ description: 'Accepted for compatibility; not stored' })
  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  requestedPax?: number;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Legacy: { from, to }' })
  @IsObject()
  @RawJson()
  @IsOptional()
  requestedDates?: Record<string, any>;

  @ApiPropertyOptional({ description: 'What is needed, in words' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  requirements?: string;
}

/** The seller's price. Send offeredPriceCents (minor units); quotedPrice (major units) is legacy. */
export class RespondQuoteDto {
  @ApiPropertyOptional({ description: 'Offered price in minor units (cents)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_CENTS)
  @IsOptional()
  offeredPriceCents?: number;

  @ApiPropertyOptional({ description: 'Legacy: quoted price in MAJOR currency units' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  @IsOptional()
  quotedPrice?: number;

  @ApiPropertyOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;
}
