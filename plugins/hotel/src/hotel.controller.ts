import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HotelService, CreateHotelDto, CreateRoomTypeDto, CreateAllotmentDto } from './hotel.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Hotel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/hotel')
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  // ── Hotels ────────────────────────────────────────────────────────────────

  @Post('hotels')
  @ApiOperation({ summary: 'Create a hotel' })
  createHotel(@Request() req: any, @Body() dto: CreateHotelDto) {
    return this.hotelService.createHotel({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('hotels')
  @ApiOperation({ summary: 'List hotels' })
  @ApiQuery({ name: 'city', required: false })
  listHotels(@Request() req: any, @Query('city') city?: string) {
    return this.hotelService.listHotels(req.user.tenantId, { city });
  }

  @Get('hotels/:id')
  @ApiOperation({ summary: 'Get a hotel by ID' })
  getHotel(@Request() req: any, @Param('id') id: string) {
    return this.hotelService.getHotel(req.user.tenantId, id);
  }

  @Patch('hotels/:id')
  @ApiOperation({ summary: 'Update a hotel' })
  updateHotel(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateHotelDto>) {
    return this.hotelService.updateHotel(req.user.tenantId, id, dto);
  }

  // ── Room Types ────────────────────────────────────────────────────────────

  @Post('hotels/:hotelId/room-types')
  @ApiOperation({ summary: 'Create a room type' })
  createRoomType(@Request() req: any, @Param('hotelId') hotelId: string, @Body() dto: CreateRoomTypeDto) {
    return this.hotelService.createRoomType(req.user.tenantId, { ...dto, hotelId });
  }

  @Get('hotels/:hotelId/room-types')
  @ApiOperation({ summary: 'List room types for a hotel' })
  listRoomTypes(@Param('hotelId') hotelId: string) {
    return this.hotelService.listRoomTypes(hotelId);
  }

  @Patch('room-types/:id')
  @ApiOperation({ summary: 'Update a room type' })
  updateRoomType(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateRoomTypeDto>) {
    return this.hotelService.updateRoomType(req.user.tenantId, id, dto);
  }

  // ── Allotments ────────────────────────────────────────────────────────────

  @Post('allotments')
  @ApiOperation({ summary: 'Create an allotment block' })
  createAllotment(@Request() req: any, @Body() dto: CreateAllotmentDto) {
    return this.hotelService.createAllotment({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('allotments')
  @ApiOperation({ summary: 'List allotments' })
  @ApiQuery({ name: 'packageId', required: false })
  listAllotments(@Request() req: any, @Query('packageId') packageId?: string) {
    return this.hotelService.listAllotments(req.user.tenantId, packageId);
  }

  @Get('allotments/:id')
  @ApiOperation({ summary: 'Get allotment by ID' })
  getAllotment(@Request() req: any, @Param('id') id: string) {
    return this.hotelService.getAllotment(req.user.tenantId, id);
  }

  // ── Room Assignments ──────────────────────────────────────────────────────

  @Post('allotments/:allotmentId/assign')
  @ApiOperation({ summary: 'Assign a pilgrim to a room in an allotment' })
  assignRoom(
    @Request() req: any,
    @Param('allotmentId') allotmentId: string,
    @Body('pilgrimId') pilgrimId: string,
    @Body('bookingId') bookingId: string,
    @Body('roomNumber') roomNumber?: string,
  ) {
    return this.hotelService.assignRoom(req.user.tenantId, allotmentId, pilgrimId, bookingId, roomNumber);
  }

  @Get('bookings/:bookingId/room-assignments')
  @ApiOperation({ summary: 'Get room assignments for a booking' })
  getAssignments(@Param('bookingId') bookingId: string) {
    return this.hotelService.getAssignmentsByBooking(bookingId);
  }

  @Delete('room-assignments/:id')
  @ApiOperation({ summary: 'Unassign a room' })
  unassign(@Request() req: any, @Param('id') id: string) {
    return this.hotelService.unassignRoom(req.user.tenantId, id);
  }
}
