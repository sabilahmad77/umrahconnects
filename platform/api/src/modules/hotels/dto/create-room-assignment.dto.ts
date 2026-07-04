import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum AssignmentStatus {
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  CHECKED_OUT = 'CHECKED_OUT',
  CANCELLED = 'CANCELLED',
}

export class CreateRoomAssignmentDto {
  @ApiProperty()
  @IsUUID()
  roomTypeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  allotmentId?: string;

  @ApiProperty()
  @IsUUID()
  bookingId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomNumber?: string;

  @ApiProperty()
  @IsDateString()
  checkIn: string;

  @ApiProperty()
  @IsDateString()
  checkOut: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialRequests?: string;
}
