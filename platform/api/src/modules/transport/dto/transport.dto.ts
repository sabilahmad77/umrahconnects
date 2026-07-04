import { IsString, IsOptional, IsNumber, IsArray, IsDateString, IsUUID, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVehicleDto {
  @IsString() type: string;
  @IsString() plateNumber: string;
  @IsNumber() capacity: number;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() make?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsNumber() year?: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsNumber() luggageCapacity?: number;
  @IsOptional() @IsBoolean() hasAc?: boolean;
  @IsOptional() @IsBoolean() licensedForHajj?: boolean;
  @IsOptional() @IsString() saudiLicenseNo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) documentUrls?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() plateNumber?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsNumber() capacity?: number;
  @IsOptional() @IsNumber() bookedSeats?: number;
  @IsOptional() @IsNumber() luggageCapacity?: number;
  @IsOptional() @IsBoolean() hasAc?: boolean;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsNumber() year?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) documentUrls?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() currentDriverId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class CreateDriverDto {
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsString() phone: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsString() licenseNumber?: string;
  @IsOptional() @IsDateString() licenseExpiry?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentUrls?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateRouteDto {
  @IsString() name: string;
  @IsOptional() @IsString() movementType?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() originCity?: string;
  @IsOptional() @IsString() destCity?: string;
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsString() pickupPoint?: string;
  @IsOptional() @IsString() dropoffPoint?: string;
  @IsOptional() @IsNumber() estimatedDuration?: number;
  @IsOptional() @IsNumber() durationMins?: number;
  @IsOptional() @IsNumber() distanceKm?: number;
  @IsOptional() @IsDateString() departureAt?: string;
  @IsOptional() @IsDateString() arrivalAt?: string;
  @IsOptional() @IsNumber() totalSeats?: number;
  @IsOptional() @IsNumber() pricePerSeat?: number;
  @IsOptional() @IsNumber() pricePerVehicle?: number;
  @IsOptional() @IsNumber() pricePerPax?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() vehicleId?: string;
  @IsOptional() @IsString() driverId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateAssignmentDto {
  @IsUUID() vehicleId: string;
  @IsOptional() @IsUUID() driverId?: string;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
  @IsOptional() @IsUUID() tripGroupId?: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsDateString() scheduledAt: string;
  @IsOptional() @IsString() customerType?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerEmail?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsOptional() @IsString() pickupLocation?: string;
  @IsOptional() @IsString() dropoffLocation?: string;
  @IsOptional() @IsNumber() passengerCount?: number;
  @IsOptional() @IsNumber() passengers?: number;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsNumber() priceCents?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CreateTasreehDto {
  @IsUUID() vehicleId: string;
  @IsString() permitNumber: string;
  @IsDateString() issueDate: string;
  @IsDateString() expiryDate: string;
  @IsOptional() @IsArray() @IsString({ each: true }) zones?: string[];
}

export class QueryTransportDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsNumber() page?: number = 1;
  @IsOptional() @Type(() => Number) @IsNumber() limit?: number = 20;
}
