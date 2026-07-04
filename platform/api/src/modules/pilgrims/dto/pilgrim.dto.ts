import { IsString, IsEmail, IsOptional, IsEnum, IsArray, IsDateString, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum PilgrimStatus {
  LEAD = 'LEAD',
  REGISTERED = 'REGISTERED',
  DOCUMENT_COLLECTION = 'DOCUMENT_COLLECTION',
  VISA_APPLIED = 'VISA_APPLIED',
  VISA_APPROVED = 'VISA_APPROVED',
  DEPARTED = 'DEPARTED',
  IN_MAKKAH = 'IN_MAKKAH',
  IN_MADINAH = 'IN_MADINAH',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum Gender { MALE = 'MALE', FEMALE = 'FEMALE' }

export class CreatePilgrimDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @IsString() firstNameAr?: string;
  @IsOptional() @IsString() lastNameAr?: string;
  @IsOptional() @IsString() passportNumber?: string;
  @IsOptional() @IsDateString() passportExpiry?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsUUID() mahramId?: string;
  @IsOptional() @IsUUID() familyGroupId?: string;
  @IsOptional() @IsEnum(PilgrimStatus) status?: PilgrimStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdatePilgrimDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() firstNameAr?: string;
  @IsOptional() @IsString() lastNameAr?: string;
  @IsOptional() @IsString() passportNumber?: string;
  @IsOptional() @IsDateString() passportExpiry?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(Gender) gender?: Gender;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEnum(PilgrimStatus) status?: PilgrimStatus;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class QueryPilgrimDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(PilgrimStatus) status?: PilgrimStatus;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number = 20;
}

export class AddDocumentDto {
  @IsString() type: string;
  @IsString() fileUrl: string;
  @IsString() fileName: string;
  @IsOptional() @IsNumber() fileSize?: number;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}
