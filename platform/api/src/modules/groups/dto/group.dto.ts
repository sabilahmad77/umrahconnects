import { IsString, IsOptional, IsNumber, IsDateString, IsUUID, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGroupDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsUUID() packageId?: string;
  @IsOptional() @IsUUID() leadGuideId?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() returnDate?: string;
  @IsOptional() @IsNumber() maxCapacity?: number;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() notes?: string;
}

export class UpdateGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() coverUrl?: string;
  @IsOptional() @IsString() tripType?: string;
  @IsOptional() @IsString() season?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsUUID() leadGuideId?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsDateString() returnDate?: string;
  @IsOptional() @IsNumber() maxCapacity?: number;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() notes?: string;
  @IsOptional() briefingNotes?: string;
  @IsOptional() itinerary?: any;
  @IsOptional() emergencyContact?: any;
}

export class QueryGroupDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() visibility?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}

export class CreateIncidentDto {
  @IsString() type: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() title?: string;
  @IsString() description: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
}

export class UpdateIncidentDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() severity?: string;
  @IsOptional() @IsString() resolution?: string;
  @IsOptional() @IsDateString() resolvedAt?: string;
}
