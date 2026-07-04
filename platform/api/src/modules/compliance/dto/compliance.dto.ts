import { IsString, IsOptional, IsNumber, IsDateString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVisaDto {
  @IsUUID() pilgrimId: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsString() type: string;
  @IsString() regulatorySystem: string;
  @IsOptional() @IsString() passportNumber?: string;
  @IsOptional() @IsString() entryType?: string;
  @IsOptional() @IsNumber() fees?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateVisaDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() visaNumber?: string;
  @IsOptional() @IsString() applicationRef?: string;
  @IsOptional() @IsDateString() approvedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() rejectionReason?: string;
}
export class QueryVisaDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsString() pilgrimId?: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}
export class CreateSubmissionDto {
  @IsString() system: string;
  @IsOptional() @IsString() batchRef?: string;
  @IsOptional() @IsString() notes?: string;
}
