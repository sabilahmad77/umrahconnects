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
import {
  BookingService,
  CreatePackageDto,
  CreateBookingDto,
  BookingStatus,
} from './booking.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Booking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ── Packages ──────────────────────────────────────────────────────────────

  @Post('packages')
  @ApiOperation({ summary: 'Create a new package' })
  createPackage(@Request() req: any, @Body() dto: CreatePackageDto) {
    return this.bookingService.createPackage({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('packages')
  @ApiOperation({ summary: 'List packages' })
  @ApiQuery({ name: 'type', required: false, enum: ['umrah', 'hajj'] })
  @ApiQuery({ name: 'season', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listPackages(
    @Request() req: any,
    @Query('type') type?: 'umrah' | 'hajj',
    @Query('season') season?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.bookingService.listPackages(req.user.tenantId, { type, season, page, limit });
  }

  @Get('packages/:id')
  @ApiOperation({ summary: 'Get a package by ID' })
  getPackage(@Request() req: any, @Param('id') id: string) {
    return this.bookingService.getPackage(req.user.tenantId, id);
  }

  @Patch('packages/:id')
  @ApiOperation({ summary: 'Update a package' })
  updatePackage(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreatePackageDto>) {
    return this.bookingService.updatePackage(req.user.tenantId, id, dto);
  }

  @Delete('packages/:id')
  @ApiOperation({ summary: 'Delete a package' })
  deletePackage(@Request() req: any, @Param('id') id: string) {
    return this.bookingService.deletePackage(req.user.tenantId, id);
  }

  // ── Bookings ──────────────────────────────────────────────────────────────

  @Post('bookings')
  @ApiOperation({ summary: 'Create a booking' })
  createBooking(@Request() req: any, @Body() dto: CreateBookingDto) {
    return this.bookingService.createBooking({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('bookings')
  @ApiOperation({ summary: 'List bookings' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'packageId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listBookings(
    @Request() req: any,
    @Query('status') status?: BookingStatus,
    @Query('packageId') packageId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.bookingService.listBookings(req.user.tenantId, { status, packageId, page, limit });
  }

  @Get('bookings/:id')
  @ApiOperation({ summary: 'Get a booking by ID' })
  getBooking(@Request() req: any, @Param('id') id: string) {
    return this.bookingService.getBooking(req.user.tenantId, id);
  }

  @Patch('bookings/:id/status')
  @ApiOperation({ summary: 'Update booking status' })
  updateStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: BookingStatus) {
    return this.bookingService.updateBookingStatus(req.user.tenantId, id, status);
  }

  @Post('bookings/:id/cancel')
  @ApiOperation({ summary: 'Cancel a booking' })
  cancelBooking(@Request() req: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.bookingService.cancelBooking(req.user.tenantId, id, reason);
  }

  @Get('bookings/:id/pilgrims')
  @ApiOperation({ summary: 'List pilgrims on a booking' })
  getBookingPilgrims(@Param('id') id: string) {
    return this.bookingService.getBookingPilgrims(id);
  }

  @Post('bookings/:bookingId/pilgrims/:pilgrimId')
  @ApiOperation({ summary: 'Add pilgrim to a booking' })
  addPilgrim(@Param('bookingId') bookingId: string, @Param('pilgrimId') pilgrimId: string) {
    return this.bookingService.addPilgrimToBooking(bookingId, pilgrimId);
  }

  @Delete('bookings/:bookingId/pilgrims/:pilgrimId')
  @ApiOperation({ summary: 'Remove pilgrim from a booking' })
  removePilgrim(@Param('bookingId') bookingId: string, @Param('pilgrimId') pilgrimId: string) {
    return this.bookingService.removePilgrimFromBooking(bookingId, pilgrimId);
  }
}
