import { PartialType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID, IsNumber, IsInt, Min, MaxLength } from 'class-validator';
import { BookingStatus } from './create-booking.dto';

export class UpdateBookingDto extends PartialType(CreateBookingDto) {}

export class UpdateBookingStatusDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancelReason?: string;
}

export class AssignBookingGroupDto {
  @ApiPropertyOptional({ nullable: true, description: 'Trip group id, or null to unassign' })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;
}

export class AssignBookingPackageDto {
  @ApiProperty()
  @IsUUID()
  packageId: string;
}

/**
 * PUT /bookings/:id/payment — manual payment bookkeeping.
 * Amount must be 0..booking total (checked in the service); status is
 * normalised through the booking status enum/aliases.
 */
export class SetBookingPaymentDto {
  @ApiPropertyOptional({ description: 'Paid amount in major units (SAR)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ description: 'Paid amount in cents — alternative to paidAmount' })
  @IsOptional()
  @IsInt()
  @Min(0)
  paidAmountCents?: number;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

export class CancelBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class AddBookingPilgrimDto {
  @ApiProperty()
  @IsUUID()
  pilgrimId: string;
}
