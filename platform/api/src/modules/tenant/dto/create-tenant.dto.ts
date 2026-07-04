import {
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
  IsISO31661Alpha2,
  Matches,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantType, RegulatorySystem } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'maktour-indonesia' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
  @MaxLength(100)
  slug: string;

  @ApiProperty({ example: 'Maktour Indonesia' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'مكتور إندونيسيا' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiProperty({ enum: TenantType })
  @IsEnum(TenantType)
  type: TenantType;

  @ApiProperty({ example: 'admin@maktour.co.id' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'ID', description: 'ISO 3166-1 alpha-2 country code' })
  @IsISO31661Alpha2()
  country: string;

  @ApiPropertyOptional({ example: 'PPIU-ID-12345' })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO31661Alpha2()
  licenseCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @ApiPropertyOptional({ enum: RegulatorySystem })
  @IsOptional()
  @IsEnum(RegulatorySystem)
  regulatorySystem?: RegulatorySystem;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentTenantId?: string;
}
