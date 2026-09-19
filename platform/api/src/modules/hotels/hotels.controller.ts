import { BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HotelsService } from './hotels.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateAllotmentDto, CreateHotelBookingDto, CreateHotelDto, CreateRoomAssignmentDto, CreateRoomDto,
  CreateRoomTypeDto, HOTEL_BOOKING_STATUSES, QueryAvailabilityDto, QueryHotelDto, QueryRoomAvailabilityDto,
  UpdateAllotmentDto, UpdateHotelBookingDto, UpdateHotelDto, UpdateRoomDto, UpdateRoomTypeDto,
} from './dto/hotel.dto';

@ApiTags('hotels')
@Controller({ path: 'hotels', version: '1' })
@ApiBearerAuth()
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  @RequirePermissions('hotel:allotment:read')
  async findAll(@TenantId() tenantId: string, @Query() query: QueryHotelDto) {
    return { success: true, data: await this.service.findAll(tenantId, query) };
  }

  @Post()
  @RequirePermissions('hotel:allotment:manage')
  async create(@TenantId() tenantId: string, @Body() dto: CreateHotelDto) {
    return { success: true, data: await this.service.create(tenantId, dto) };
  }

  @Get('stats')
  @RequirePermissions('hotel:allotment:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }

  @Get('availability')
  @RequirePermissions('hotel:allotment:read')
  async checkAvailability(@TenantId() tenantId: string, @Query() query: QueryAvailabilityDto) {
    return { success: true, data: await this.service.checkAvailability(tenantId, query) };
  }

  // ── Hotel bookings (collection routes — must precede :id) ──────────────
  @Get('bookings')
  @RequirePermissions('hotel:allotment:read')
  async getHotelBookings(
    @TenantId() tenantId: string,
    @Query('hotelId', new ParseUUIDPipe({ optional: true })) hotelId?: string,
    @Query('status') status?: string,
  ) {
    if (status && !(HOTEL_BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(`status must be one of ${HOTEL_BOOKING_STATUSES.join(', ')}`);
    }
    return { success: true, data: await this.service.getHotelBookings(tenantId, { hotelId, status }) };
  }

  @Post('bookings')
  @RequirePermissions('hotel:allotment:manage')
  async createHotelBooking(@TenantId() tenantId: string, @Body() dto: CreateHotelBookingDto) {
    return { success: true, data: await this.service.createHotelBooking(tenantId, dto) };
  }

  @Get('bookings/:bookingId')
  @RequirePermissions('hotel:allotment:read')
  async findHotelBooking(@TenantId() tenantId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return { success: true, data: await this.service.findHotelBooking(tenantId, bookingId) };
  }

  @Put('bookings/:bookingId')
  @RequirePermissions('hotel:allotment:manage')
  async updateHotelBooking(@TenantId() tenantId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: UpdateHotelBookingDto) {
    return { success: true, data: await this.service.updateHotelBooking(tenantId, bookingId, dto) };
  }

  // ── Rooms / room-types (collection routes — must precede :id) ──────────
  @Put('rooms/:roomId')
  @RequirePermissions('hotel:allotment:manage')
  async updateRoom(@TenantId() tenantId: string, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: UpdateRoomDto) {
    return { success: true, data: await this.service.updateRoom(tenantId, roomId, dto) };
  }

  @Delete('rooms/:roomId')
  @RequirePermissions('hotel:allotment:manage')
  async deleteRoom(@TenantId() tenantId: string, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return { success: true, data: await this.service.deleteRoom(tenantId, roomId) };
  }

  @Put('room-types/:roomTypeId')
  @RequirePermissions('hotel:allotment:manage')
  async updateRoomType(@TenantId() tenantId: string, @Param('roomTypeId', ParseUUIDPipe) roomTypeId: string, @Body() dto: UpdateRoomTypeDto) {
    return { success: true, data: await this.service.updateRoomType(tenantId, roomTypeId, dto) };
  }

  // Adjusts a contract (rooms, buffer, rate, notes); bookedRooms stays server-owned.
  @Put('allotments/:allotmentId')
  @RequirePermissions('hotel:allotment:manage')
  async updateAllotment(@TenantId() tenantId: string, @Param('allotmentId', ParseUUIDPipe) allotmentId: string, @Body() dto: UpdateAllotmentDto) {
    return { success: true, data: await this.service.updateAllotment(tenantId, allotmentId, dto) };
  }

  // ── Single hotel ───────────────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('hotel:allotment:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @Put(':id')
  @RequirePermissions('hotel:allotment:manage')
  async update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHotelDto) {
    return { success: true, data: await this.service.update(tenantId, id, dto) };
  }

  @Delete(':id')
  @RequirePermissions('hotel:allotment:manage')
  async remove(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.remove(tenantId, id) };
  }

  // ── Room types ─────────────────────────────────────────────────────────
  @Get(':id/room-types')
  @RequirePermissions('hotel:allotment:read')
  async getRoomTypes(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getRoomTypes(tenantId, id) };
  }

  @Post(':id/room-types')
  @RequirePermissions('hotel:allotment:manage')
  async addRoomType(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoomTypeDto) {
    return { success: true, data: await this.service.addRoomType(tenantId, id, dto) };
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  /** Which rooms are free for a stay (not archived, not held by an overlapping booking). */
  @Get(':id/room-availability')
  @RequirePermissions('hotel:allotment:read')
  async roomAvailability(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: QueryRoomAvailabilityDto) {
    return { success: true, data: await this.service.roomAvailability(tenantId, id, query) };
  }

  @Get(':id/rooms')
  @RequirePermissions('hotel:allotment:read')
  async getRooms(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getRooms(tenantId, id) };
  }

  @Post(':id/rooms')
  @RequirePermissions('hotel:allotment:manage')
  async createRoom(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoomDto) {
    return { success: true, data: await this.service.createRoom(tenantId, id, dto) };
  }

  // ── Allotments ─────────────────────────────────────────────────────────
  // Reading contracts is part of hotel:allotment:read ("view hotels, rooms, allotments and hotel bookings").
  @Get(':id/allotments')
  @RequirePermissions('hotel:allotment:read')
  async getAllotments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getAllotments(tenantId, id) };
  }

  @Post(':id/allotments')
  @RequirePermissions('hotel:allotment:manage')
  async createAllotment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAllotmentDto) {
    return { success: true, data: await this.service.createAllotment(tenantId, id, dto) };
  }

  @Get(':id/assignments')
  @RequirePermissions('hotel:allotment:read')
  async getAssignments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getAssignments(tenantId, id) };
  }

  // Placing travelers into contracted rooms is hotel:room:assign ("assign rooms to travelers").
  @Post(':id/assignments')
  @RequirePermissions('hotel:room:assign')
  async createAssignment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRoomAssignmentDto) {
    return { success: true, data: await this.service.createAssignment(tenantId, id, dto) };
  }

  // Releasing an assignment is a management action (hotel:assignment:manage).
  @Delete(':id/assignments/:assignmentId')
  @RequirePermissions('hotel:assignment:manage')
  async deleteAssignment(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return { success: true, data: await this.service.deleteAssignment(tenantId, id, assignmentId) };
  }
}
