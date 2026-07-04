import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HotelsService } from './hotels.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('hotels')
@Controller({ path: 'hotels', version: '1' })
@ApiBearerAuth()
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  @RequirePermissions('hotel:allotment:read')
  async findAll(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findAll(tenantId, query) };
  }

  @Post()
  @RequirePermissions('hotel:allotment:manage')
  async create(@TenantId() tenantId: string, @Body() dto: any) {
    return { success: true, data: await this.service.create(tenantId, dto) };
  }

  @Get('stats')
  @RequirePermissions('hotel:allotment:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }

  @Get('availability')
  @RequirePermissions('hotel:allotment:read')
  async checkAvailability(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.checkAvailability(tenantId, query) };
  }

  // ── Hotel bookings (collection routes — must precede :id) ──────────────
  @Get('bookings')
  @RequirePermissions('hotel:allotment:read')
  async getHotelBookings(@TenantId() tenantId: string, @Query('hotelId') hotelId?: string, @Query('status') status?: string) {
    return { success: true, data: await this.service.getHotelBookings(tenantId, { hotelId, status }) };
  }

  @Post('bookings')
  @RequirePermissions('hotel:allotment:manage')
  async createHotelBooking(@TenantId() tenantId: string, @Body() dto: any) {
    return { success: true, data: await this.service.createHotelBooking(tenantId, dto) };
  }

  @Get('bookings/:bookingId')
  @RequirePermissions('hotel:allotment:read')
  async findHotelBooking(@TenantId() tenantId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return { success: true, data: await this.service.findHotelBooking(tenantId, bookingId) };
  }

  @Put('bookings/:bookingId')
  @RequirePermissions('hotel:allotment:manage')
  async updateHotelBooking(@TenantId() tenantId: string, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateHotelBooking(tenantId, bookingId, dto) };
  }

  // ── Rooms / room-types (collection routes — must precede :id) ──────────
  @Put('rooms/:roomId')
  @RequirePermissions('hotel:allotment:manage')
  async updateRoom(@TenantId() tenantId: string, @Param('roomId', ParseUUIDPipe) roomId: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateRoom(tenantId, roomId, dto) };
  }

  @Delete('rooms/:roomId')
  @RequirePermissions('hotel:allotment:manage')
  async deleteRoom(@TenantId() tenantId: string, @Param('roomId', ParseUUIDPipe) roomId: string) {
    return { success: true, data: await this.service.deleteRoom(tenantId, roomId) };
  }

  @Put('room-types/:roomTypeId')
  @RequirePermissions('hotel:allotment:manage')
  async updateRoomType(@TenantId() tenantId: string, @Param('roomTypeId', ParseUUIDPipe) roomTypeId: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateRoomType(tenantId, roomTypeId, dto) };
  }

  // ── Single hotel ───────────────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('hotel:allotment:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @Put(':id')
  @RequirePermissions('hotel:allotment:manage')
  async update(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
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
  async addRoomType(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.addRoomType(tenantId, id, dto) };
  }

  // ── Rooms ──────────────────────────────────────────────────────────────
  @Get(':id/rooms')
  @RequirePermissions('hotel:allotment:read')
  async getRooms(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getRooms(tenantId, id) };
  }

  @Post(':id/rooms')
  @RequirePermissions('hotel:allotment:manage')
  async createRoom(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.createRoom(tenantId, id, dto) };
  }

  // ── Allotments ─────────────────────────────────────────────────────────
  @Get(':id/allotments')
  @RequirePermissions('hotel:allotment:manage')
  async getAllotments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getAllotments(tenantId, id) };
  }

  @Post(':id/allotments')
  @RequirePermissions('hotel:allotment:manage')
  async createAllotment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.createAllotment(tenantId, id, dto) };
  }

  @Get(':id/assignments')
  @RequirePermissions('hotel:assignment:manage')
  async getAssignments(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.getAssignments(tenantId, id) };
  }

  @Post(':id/assignments')
  @RequirePermissions('hotel:assignment:manage')
  async createAssignment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.createAssignment(tenantId, id, dto) };
  }
}
