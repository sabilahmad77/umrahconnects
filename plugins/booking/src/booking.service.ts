import { Injectable, NotFoundException } from '@nestjs/common';

export interface CreatePackageDto {
  tenantId: string;
  name: string;
  type: 'umrah' | 'hajj';
  season: string;
  durationDays: number;
  pricePerPerson: number;
  currency: string;
  capacity: number;
  hotelIds?: string[];
  description?: string;
}

export interface Package extends CreatePackageDto {
  id: string;
  available: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBookingDto {
  tenantId: string;
  packageId: string;
  leadPilgrimId: string;
  pilgrimIds: string[];
  notes?: string;
}

export type BookingStatus = 'draft' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking extends CreateBookingDto {
  id: string;
  status: BookingStatus;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingPilgrim {
  bookingId: string;
  pilgrimId: string;
  seatNumber?: string;
  roomAssignment?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

@Injectable()
export class BookingService {
  // ── Packages ──────────────────────────────────────────────────────────────

  async createPackage(dto: CreatePackageDto): Promise<Package> {
    // TODO: implement - persist package to plugin_booking.packages
    throw new Error('Not implemented');
  }

  async getPackage(tenantId: string, packageId: string): Promise<Package> {
    // TODO: implement - query by tenantId + packageId
    throw new NotFoundException(`Package ${packageId} not found`);
  }

  async listPackages(
    tenantId: string,
    options: { type?: 'umrah' | 'hajj'; season?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Package[]; total: number }> {
    // TODO: implement - paginated package listing filtered by tenantId
    return { data: [], total: 0 };
  }

  async updatePackage(tenantId: string, packageId: string, dto: Partial<CreatePackageDto>): Promise<Package> {
    // TODO: implement - patch package record
    throw new NotFoundException(`Package ${packageId} not found`);
  }

  async deletePackage(tenantId: string, packageId: string): Promise<void> {
    // TODO: implement - soft-delete package
  }

  // ── Bookings ──────────────────────────────────────────────────────────────

  async createBooking(dto: CreateBookingDto): Promise<Booking> {
    // TODO: implement - create booking, decrement package capacity, associate pilgrims
    throw new Error('Not implemented');
  }

  async getBooking(tenantId: string, bookingId: string): Promise<Booking> {
    // TODO: implement - load booking with pilgrims
    throw new NotFoundException(`Booking ${bookingId} not found`);
  }

  async listBookings(
    tenantId: string,
    options: { status?: BookingStatus; packageId?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: Booking[]; total: number }> {
    // TODO: implement - paginated booking listing
    return { data: [], total: 0 };
  }

  async updateBookingStatus(tenantId: string, bookingId: string, status: BookingStatus): Promise<Booking> {
    // TODO: implement - transition booking status with validation
    throw new NotFoundException(`Booking ${bookingId} not found`);
  }

  async cancelBooking(tenantId: string, bookingId: string, reason?: string): Promise<void> {
    // TODO: implement - cancel booking, restore capacity, trigger refund flow
  }

  // ── Booking Pilgrims ──────────────────────────────────────────────────────

  async addPilgrimToBooking(bookingId: string, pilgrimId: string): Promise<BookingPilgrim> {
    // TODO: implement - link pilgrim to booking
    throw new Error('Not implemented');
  }

  async removePilgrimFromBooking(bookingId: string, pilgrimId: string): Promise<void> {
    // TODO: implement - unlink pilgrim from booking
  }

  async getBookingPilgrims(bookingId: string): Promise<BookingPilgrim[]> {
    // TODO: implement - list pilgrims for a booking
    return [];
  }
}
