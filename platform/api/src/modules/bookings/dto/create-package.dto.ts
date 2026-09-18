import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum PackageType {
  UMRAH = 'UMRAH',
  HAJJ = 'HAJJ',
  ZIYARAH = 'ZIYARAH',
  CUSTOM = 'CUSTOM',
}

export enum PackageStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  FULL = 'FULL',
  ARCHIVED = 'ARCHIVED',
}

export class CreatePackageDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ enum: PackageType })
  @IsEnum(PackageType)
  type: PackageType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departureCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  departureDateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  departureDateTo?: string;

  @ApiProperty({ description: 'Price per adult in major units (SAR)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  priceAdult: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceChild?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  priceInfant?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inclusions?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exclusions?: string[];

  @ApiPropertyOptional({ enum: PackageStatus })
  @IsOptional()
  @IsEnum(PackageStatus)
  status?: PackageStatus;
}
