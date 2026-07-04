import { IsString, IsOptional, IsNumber, IsArray, IsEnum, IsDateString, IsDecimal } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateHotelDto {
  @IsString() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsNumber() starRating?: number;
  @IsOptional() @IsNumber() distanceToHaram?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsNumber() totalRooms?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() checkInTime?: string;
  @IsOptional() @IsString() checkOutTime?: string;
}

export class UpdateHotelDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsNumber() starRating?: number;
  @IsOptional() @IsNumber() distanceToHaram?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsNumber() totalRooms?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsString() status?: string;
}

export class QueryHotelDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsNumber() starRating?: number;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}

export class CreateRoomTypeDto {
  @IsString() name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() capacity?: string;
  @IsOptional() @IsNumber() basePrice?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
}

export class CreateAllotmentDto {
  @IsString() roomTypeId: string;
  @IsString() checkIn: string;
  @IsString() checkOut: string;
  @IsNumber() totalRooms: number;
  @IsOptional() @IsNumber() contractPrice?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() contractRef?: string;
}

export class CreateRoomAssignmentDto {
  @IsString() roomTypeId: string;
  @IsOptional() @IsString() allotmentId?: string;
  @IsString() bookingId: string;
  @IsOptional() @IsString() roomNumber?: string;
  @IsString() checkIn: string;
  @IsString() checkOut: string;
  @IsOptional() @IsNumber() guestCount?: number;
  @IsOptional() @IsString() specialRequests?: string;
}
