import { IsString, IsOptional, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateQuoteDto {
  @ApiProperty()
  @IsString()
  listingId: string;

  @ApiProperty()
  @IsString()
  vendorId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  requestedPax?: number;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  requestedDates?: Record<string, any>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  requirements?: string;
}

export class RespondQuoteDto {
  @ApiProperty()
  @IsNumber()
  @Type(() => Number)
  quotedPrice: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}
