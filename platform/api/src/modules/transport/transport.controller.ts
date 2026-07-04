import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TransportService } from './transport.service';
import { CreateVehicleDto, UpdateVehicleDto, CreateDriverDto, CreateRouteDto, CreateAssignmentDto, CreateTasreehDto, QueryTransportDto } from './dto/transport.dto';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('transport')
@Controller({ path: 'transport', version: '1' })
@ApiBearerAuth()
export class TransportController {
  constructor(private readonly service: TransportService) {}

  // ── Vehicles ─────────────────────────────────────────────────────────
  @Get('vehicles')
  @RequirePermissions('transport:vehicle:read')
  async findVehicles(@TenantId() tenantId: string, @Query() query: QueryTransportDto) {
    return { success: true, data: await this.service.findVehicles(tenantId, query) };
  }

  @Get('vehicles/:id')
  @RequirePermissions('transport:vehicle:read')
  async findVehicleById(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findVehicleById(tenantId, id) };
  }

  @Post('vehicles')
  @RequirePermissions('transport:vehicle:manage')
  async createVehicle(@TenantId() tenantId: string, @Body() dto: CreateVehicleDto) {
    return { success: true, data: await this.service.createVehicle(tenantId, dto) };
  }

  @Put('vehicles/:id')
  @RequirePermissions('transport:vehicle:manage')
  async updateVehicle(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVehicleDto) {
    return { success: true, data: await this.service.updateVehicle(tenantId, id, dto) };
  }

  @Delete('vehicles/:id')
  @RequirePermissions('transport:vehicle:manage')
  async deleteVehicle(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteVehicle(tenantId, id) };
  }

  @Post('vehicles/:id/drivers')
  @RequirePermissions('transport:vehicle:manage')
  async assignDriver(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { driverId: string; isPrimary?: boolean }) {
    return { success: true, data: await this.service.assignDriver(tenantId, id, body.driverId, body.isPrimary) };
  }

  @Delete('vehicles/:id/drivers/:driverId')
  @RequirePermissions('transport:vehicle:manage')
  async unassignDriver(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('driverId', ParseUUIDPipe) driverId: string) {
    return { success: true, data: await this.service.unassignDriver(tenantId, id, driverId) };
  }

  // ── Drivers ─────────────────────────────────────────────────────────
  @Get('drivers')
  @RequirePermissions('transport:vehicle:read')
  async findDrivers(@TenantId() tenantId: string, @Query() query: QueryTransportDto) {
    return { success: true, data: await this.service.findDrivers(tenantId, query) };
  }

  @Get('drivers/:id')
  @RequirePermissions('transport:vehicle:read')
  async findDriverById(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findDriverById(tenantId, id) };
  }

  @Post('drivers')
  @RequirePermissions('transport:vehicle:manage')
  async createDriver(@TenantId() tenantId: string, @Body() dto: CreateDriverDto) {
    return { success: true, data: await this.service.createDriver(tenantId, dto) };
  }

  @Put('drivers/:id')
  @RequirePermissions('transport:vehicle:manage')
  async updateDriver(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.updateDriver(tenantId, id, body) };
  }

  @Delete('drivers/:id')
  @RequirePermissions('transport:vehicle:manage')
  async deleteDriver(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteDriver(tenantId, id) };
  }

  // ── Routes ──────────────────────────────────────────────────────────
  @Get('routes')
  @RequirePermissions('transport:vehicle:read')
  async findRoutes(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findRoutes(tenantId, query) };
  }

  @Get('routes/:id')
  @RequirePermissions('transport:vehicle:read')
  async findRouteById(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findRouteById(tenantId, id) };
  }

  @Post('routes')
  @RequirePermissions('transport:vehicle:manage')
  async createRoute(@TenantId() tenantId: string, @Body() dto: CreateRouteDto) {
    return { success: true, data: await this.service.createRoute(tenantId, dto) };
  }

  @Put('routes/:id')
  @RequirePermissions('transport:vehicle:manage')
  async updateRoute(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.updateRoute(tenantId, id, body) };
  }

  @Delete('routes/:id')
  @RequirePermissions('transport:vehicle:manage')
  async deleteRoute(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteRoute(tenantId, id) };
  }

  // ── Assignments / Bookings ──────────────────────────────────────────
  @Get('assignments')
  @RequirePermissions('transport:assignment:manage')
  async findAssignments(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findAssignments(tenantId, query) };
  }

  @Get('assignments/:id')
  @RequirePermissions('transport:assignment:manage')
  async findAssignmentById(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findAssignmentById(tenantId, id) };
  }

  @Post('assignments')
  @RequirePermissions('transport:assignment:manage')
  async createAssignment(@TenantId() tenantId: string, @Body() dto: CreateAssignmentDto) {
    return { success: true, data: await this.service.createAssignment(tenantId, dto) };
  }

  @Put('assignments/:id')
  @RequirePermissions('transport:assignment:manage')
  async updateAssignment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: any) {
    return { success: true, data: await this.service.updateAssignment(tenantId, id, body) };
  }

  @Post('assignments/:id/cancel')
  @RequirePermissions('transport:assignment:manage')
  async cancelAssignment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.cancelAssignment(tenantId, id) };
  }

  // Bookings = assignments — alias for readability
  @Get('bookings')
  @RequirePermissions('transport:assignment:manage')
  async findBookings(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findAssignments(tenantId, query) };
  }

  @Post('bookings')
  @RequirePermissions('transport:assignment:manage')
  async createBooking(@TenantId() tenantId: string, @Body() dto: CreateAssignmentDto) {
    return { success: true, data: await this.service.createAssignment(tenantId, dto) };
  }

  // ── Tasreeh ─────────────────────────────────────────────────────────
  @Get('tasreeh')
  @RequirePermissions('transport:vehicle:manage')
  async findTasreeh(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.findTasreeh(tenantId) };
  }

  @Post('tasreeh')
  @RequirePermissions('transport:vehicle:manage')
  async createTasreeh(@TenantId() tenantId: string, @Body() dto: CreateTasreehDto) {
    return { success: true, data: await this.service.createTasreeh(tenantId, dto) };
  }

  // ── Stats ───────────────────────────────────────────────────────────
  @Get('stats')
  @RequirePermissions('transport:vehicle:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getStats(tenantId) };
  }
}
