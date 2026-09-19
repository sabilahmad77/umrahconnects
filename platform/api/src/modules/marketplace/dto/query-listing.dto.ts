import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ListingCategory, MAX_PRICE_CENTS } from './create-listing.dto';
import { blankToUndefined, LISTING_STATUSES, upper } from './marketplace.dto';
import { LISTING_SORTS } from '../listing-rules';

/** Paging shared by the public catalogue and the owner's list. Limits above 50 are clamped. */
class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ListingCategory })
  @Transform(blankToUndefined)
  @IsEnum(ListingCategory)
  @IsOptional()
  category?: ListingCategory;

  @ApiPropertyOptional({ enum: LISTING_SORTS, default: 'newest' })
  @Transform(blankToUndefined)
  @IsIn(LISTING_SORTS as unknown as string[])
  @IsOptional()
  sort?: (typeof LISTING_SORTS)[number];
}

/** Public catalogue search. Prices are minor units (cents), like every money field on the wire. */
export class QueryListingDto extends PageQuery {
  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Minimum price in minor units (cents)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  @IsOptional()
  minPriceCents?: number;

  @ApiPropertyOptional({ description: 'Maximum price in minor units (cents)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  @IsOptional()
  maxPriceCents?: number;

  @ApiPropertyOptional({ description: 'Only listings priced in this currency (required for price filters to be meaningful)' })
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  vendorId?: string;
}

/** The caller organization's own listings, in any status. */
export class MyListingsQueryDto extends PageQuery {
  @ApiPropertyOptional({ enum: LISTING_STATUSES })
  @Transform(upper)
  @IsIn(LISTING_STATUSES as unknown as string[])
  @IsOptional()
  status?: string;
}
