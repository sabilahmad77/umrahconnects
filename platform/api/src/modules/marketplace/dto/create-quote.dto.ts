import { RawJson } from '../../../common/decorators/raw-json.decorator';
import { IsString, IsOptional, IsNumber, IsObject, IsUUID, IsInt, IsDateString, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateQuoteDto {
  @ApiProperty()
  @IsUUID()
  listingId: string;

  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  @IsOptional()
  @Type(() => Number)
  requestedPax?: number;

  @ApiPropertyOptional()
  @IsObject() @RawJson()
  @IsOptional()
  requestedDates?: Record<string, any>;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  requirements?: string;
}

export class RespondQuoteDto {
  @ApiProperty({ description: 'Quoted price in major currency units' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  @Type(() => Number)
  quotedPrice: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(3)
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  notes?: string;
}
