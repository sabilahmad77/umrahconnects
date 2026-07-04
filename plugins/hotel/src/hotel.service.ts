import { Injectable, NotFoundException } from '@nestjs/common';

export interface CreateHotelDto {
  tenantId: string;
  name: string;
  city: 'makkah' | 'madinah' | 'other';
  starRating: number;
  distanceToHaramMeters?: number;
  address: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface Hotel extends CreateHotelDto {
  id: string;
  createdAt: Date;
}

export interface CreateRoomTypeDto {
  hotelId: string;
  name: string;
  capacity: number;
  bedConfiguration: string;
  amenities?: string[];
  pricePerNight: number;
  currency: string;
}

export interface RoomType extends CreateRoomTypeDto {
  id: string;
}

export interface CreateAllotmentDto {
  hotelId: string;
  roomTypeId: string;
  tenantId: string;
  packageId: string;
  checkIn: Date;
  checkOut: Date;
  roomCount: number;
  ratePerRoom: number;
  currency: string;
}

export interface Allotment extends CreateAllotmentDto {
  id: string;
  usedRooms: number;
  availableRooms: number;
}

export interface RoomAssignment {
  id: string;
  allotmentId: string;
  pilgrimId: string;
  bookingId: string;
  roomNumber?: string;
  assignedAt: Date;
}

@Injectable()
export class HotelService {
  // ── Hotels ────────────────────────────────────────────────────────────────

  async createHotel(dto: CreateHotelDto): Promise<Hotel> {
    // TODO: implement - persist hotel to plugin_hotel.hotels
    throw new Error('Not implemented');
  }

  async getHotel(tenantId: string, hotelId: string): Promise<Hotel> {
    // TODO: implement - query hotel by id
    throw new NotFoundException(`Hotel ${hotelId} not found`);
  }

  async listHotels(
    tenantId: string,
    filters: { city?: string } = {},
  ): Promise<Hotel[]> {
    // TODO: implement - list hotels visible to tenant
    return [];
  }

  async updateHotel(tenantId: string, hotelId: string, dto: Partial<CreateHotelDto>): Promise<Hotel> {
    // TODO: implement - patch hotel record
    throw new NotFoundException(`Hotel ${hotelId} not found`);
  }

  // ── Room Types ────────────────────────────────────────────────────────────

  async createRoomType(tenantId: string, dto: CreateRoomTypeDto): Promise<RoomType> {
    // TODO: implement - create room type under hotel
    throw new Error('Not implemented');
  }

  async listRoomTypes(hotelId: string): Promise<RoomType[]> {
    // TODO: implement - list room types for hotel
    return [];
  }

  async updateRoomType(tenantId: string, roomTypeId: string, dto: Partial<CreateRoomTypeDto>): Promise<RoomType> {
    // TODO: implement - patch room type
    throw new NotFoundException(`RoomType ${roomTypeId} not found`);
  }

  // ── Allotments ────────────────────────────────────────────────────────────

  async createAllotment(dto: CreateAllotmentDto): Promise<Allotment> {
    // TODO: implement - create allotment block, set availableRooms = roomCount
    throw new Error('Not implemented');
  }

  async getAllotment(tenantId: string, allotmentId: string): Promise<Allotment> {
    // TODO: implement - load allotment with occupancy counts
    throw new NotFoundException(`Allotment ${allotmentId} not found`);
  }

  async listAllotments(tenantId: string, packageId?: string): Promise<Allotment[]> {
    // TODO: implement - list allotments for tenant, optionally filtered by package
    return [];
  }

  // ── Room Assignments ──────────────────────────────────────────────────────

  async assignRoom(
    tenantId: string,
    allotmentId: string,
    pilgrimId: string,
    bookingId: string,
    roomNumber?: string,
  ): Promise<RoomAssignment> {
    // TODO: implement - assign pilgrim to allotment room, decrement available count
    throw new Error('Not implemented');
  }

  async getAssignmentsByBooking(bookingId: string): Promise<RoomAssignment[]> {
    // TODO: implement - list assignments for a booking
    return [];
  }

  async unassignRoom(tenantId: string, assignmentId: string): Promise<void> {
    // TODO: implement - remove assignment, restore available count
  }
}
