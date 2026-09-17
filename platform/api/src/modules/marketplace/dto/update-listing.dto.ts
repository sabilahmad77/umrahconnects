import { PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { PRICING_MODELS, upper } from './marketplace.dto';

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Alias of title' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  @IsOptional()
  nameAr?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000_000)
  @IsOptional()
  priceCents?: number;

  @ApiPropertyOptional({ enum: PRICING_MODELS })
  @Transform(upper)
  @IsIn(PRICING_MODELS as unknown as string[])
  @IsOptional()
  pricingModel?: string;
}
