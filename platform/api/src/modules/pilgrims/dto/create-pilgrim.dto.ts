import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsArray,
  IsDateString,
  IsUUID,
} from 'class-validator';

// FIX-04: MUST mirror prisma enum PilgrimStatus (schema.prisma) exactly — this is
// the canonical source of truth. Prior drift caused 400 on valid DB statuses and
// 500 (Prisma reject) on DTO-only statuses.
export enum PilgrimStatus {
  LEAD = 'LEAD',
  PROSPECT = 'PROSPECT',
  BOOKED = 'BOOKED',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  VISA_PENDING = 'VISA_PENDING',
  VISA_APPROVED = 'VISA_APPROVED',
  VISA_REJECTED = 'VISA_REJECTED',
  TRAVELING = 'TRAVELING',
  IN_KINGDOM = 'IN_KINGDOM',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class CreatePilgrimDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastNameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  passportExpiry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  mahramId?: string;

  @ApiPropertyOptional({ enum: PilgrimStatus })
  @IsOptional()
  @IsEnum(PilgrimStatus)
  status?: PilgrimStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  familyGroupId?: string;
}
