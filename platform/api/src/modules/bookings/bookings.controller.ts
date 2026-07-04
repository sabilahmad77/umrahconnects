import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto, UpdateBookingStatusDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

@ApiTags('bookings')
@Controller({ version: '1' })
@ApiBearerAuth()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  // ─── Bookings ───────────────────────────────────────────────────────────────

  @Get('bookings/stats')
  @RequirePermissions('booking:booking:read')
  @ApiOperation({ summary: 'Get booking counts by status' })
  async getStats(@TenantId() tenantId: string) {
    const data = await this.bookingsService.getBookingStats(tenantId);
    return { success: true, data };
  }

  @Get('bookings')
  @RequirePermissions('booking:booking:read')
  @ApiOperation({ summary: 'List bookings with filters and pagination' })
  async findAll(@TenantId() tenantId: string, @Query() query: QueryBookingDto) {
    const data = await this.bookingsService.findAllBookings(tenantId, query);
    return { success: true, data };
  }

  @Post('bookings')
  @RequirePermissions('booking:booking:create')
  @ApiOperation({ summary: 'Create a new booking with pilgrim assignments' })
  async create(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateBookingDto) {
    const data = await this.bookingsService.create(tenantId, user?.sub ?? null, dto);
    return { success: true, data };
  }

  @Get('bookings/:id')
  @RequirePermissions('booking:booking:read')
  @ApiOperation({ summary: 'Get full booking detail with pilgrims' })
  async findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.bookingsService.findOneBooking(tenantId, id);
    return { success: true, data };
  }

  @Put('bookings/:id')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Update booking' })
  async update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ) {
    const data = await this.bookingsService.updateBooking(tenantId, id, dto);
    return { success: true, data };
  }

  @Put('bookings/:id/status')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Update booking status' })
  async updateStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    const data = await this.bookingsService.updateBookingStatus(tenantId, id, dto);
    return { success: true, data };
  }

  @Put('bookings/:id/assign-group')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Assign or unassign booking to a group' })
  async assignGroup(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { groupId: string | null }) {
    return { success: true, data: await this.bookingsService.assignGroup(tenantId, id, body.groupId) };
  }

  @Put('bookings/:id/assign-package')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Assign booking to a different package' })
  async assignPackage(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { packageId: string }) {
    return { success: true, data: await this.bookingsService.assignPackage(tenantId, id, body.packageId) };
  }

  @Put('bookings/:id/payment')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Update booking payment + status' })
  async setPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.bookingsService.setPayment(tenantId, id, body) };
  }

  @Post('bookings/:id/cancel')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Cancel a booking with optional reason' })
  async cancel(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason?: string }) {
    return { success: true, data: await this.bookingsService.cancel(tenantId, id, body.reason) };
  }

  @Post('bookings/:id/generate-invoice')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Generate a draft invoice from a booking' })
  async generateInvoice(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.bookingsService.generateInvoice(tenantId, id) };
  }

  @Post('bookings/:id/pilgrims')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Add a pilgrim to a booking' })
  async addPilgrim(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { pilgrimId: string }) {
    return { success: true, data: await this.bookingsService.addPilgrim(tenantId, id, body.pilgrimId) };
  }

  @Delete('bookings/:id/pilgrims/:pilgrimId')
  @RequirePermissions('booking:booking:update')
  @ApiOperation({ summary: 'Remove a pilgrim from a booking' })
  async removePilgrim(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('pilgrimId', ParseUUIDPipe) pilgrimId: string) {
    return { success: true, data: await this.bookingsService.removePilgrim(tenantId, id, pilgrimId) };
  }

  // ─── Packages ────────────────────────────────────────────────────────────────

  @Get('packages')
  @RequirePermissions('booking:package:read')
  @ApiOperation({ summary: 'List all packages' })
  async findAllPackages(@TenantId() tenantId: string) {
    const data = await this.bookingsService.findAllPackages(tenantId);
    return { success: true, data };
  }

  @Post('packages')
  @RequirePermissions('booking:package:manage')
  @ApiOperation({ summary: 'Create a new package' })
  async createPackage(@TenantId() tenantId: string, @Body() dto: CreatePackageDto) {
    const data = await this.bookingsService.createPackage(tenantId, dto);
    return { success: true, data };
  }

  @Get('packages/:id')
  @RequirePermissions('booking:package:read')
  @ApiOperation({ summary: 'Get package details' })
  async findOnePackage(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.bookingsService.findOnePackage(tenantId, id);
    return { success: true, data };
  }

  @Put('packages/:id')
  @RequirePermissions('booking:package:manage')
  @ApiOperation({ summary: 'Update package' })
  async updatePackage(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    const data = await this.bookingsService.updatePackage(tenantId, id, dto);
    return { success: true, data };
  }
}
