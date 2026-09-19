import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { blankToUndefined, upper } from './marketplace.dto';

export enum VendorType {
  HOTEL = 'HOTEL',
  TRANSPORT = 'TRANSPORT',
  GUIDE = 'GUIDE',
  CATERING = 'CATERING',
  VISA_AGENT = 'VISA_AGENT',
  OTHER = 'OTHER',
}

/** A seller profile ("vendor") of the caller's organization, shown as the seller on its listings. */
export class CreateVendorDto {
  @ApiProperty()
  @Transform(blankToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(255)
  @IsOptional()
  nameAr?: string;

  @ApiProperty({ enum: VendorType })
  @IsEnum(VendorType)
  type: VendorType;

  @ApiPropertyOptional({ description: 'Private contact address (never shown publicly)' })
  @Transform(blankToUndefined)
  @IsEmail()
  @MaxLength(255)
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Private contact number (never shown publicly)' })
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(30)
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'SA' })
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter ISO code such as SA' })
  @IsOptional()
  country?: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @Transform(blankToUndefined)
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(255)
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ description: 'Accepted for compatibility; not stored' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  licenseNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;
}

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
