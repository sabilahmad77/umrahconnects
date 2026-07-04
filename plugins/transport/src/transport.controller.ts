import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  TransportService,
  CreateVehicleDto,
  CreateDriverDto,
  CreateRouteDto,
  CreateTransportAssignmentDto,
  TransportAssignment,
  Vehicle,
  Driver,
} from './transport.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Transport')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  // ── Vehicles ──────────────────────────────────────────────────────────────

  @Post('vehicles')
  @ApiOperation({ summary: 'Register a vehicle' })
  createVehicle(@Request() req: any, @Body() dto: CreateVehicleDto) {
    return this.transportService.createVehicle({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('vehicles')
  @ApiOperation({ summary: 'List vehicles' })
  @ApiQuery({ name: 'status', required: false })
  listVehicles(@Request() req: any, @Query('status') status?: Vehicle['status']) {
    return this.transportService.listVehicles(req.user.tenantId, status);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Get vehicle by ID' })
  getVehicle(@Request() req: any, @Param('id') id: string) {
    return this.transportService.getVehicle(req.user.tenantId, id);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Update a vehicle' })
  updateVehicle(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateVehicleDto>) {
    return this.transportService.updateVehicle(req.user.tenantId, id, dto);
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  @Post('drivers')
  @ApiOperation({ summary: 'Register a driver' })
  createDriver(@Request() req: any, @Body() dto: CreateDriverDto) {
    return this.transportService.createDriver({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('drivers')
  @ApiOperation({ summary: 'List drivers' })
  @ApiQuery({ name: 'status', required: false })
  listDrivers(@Request() req: any, @Query('status') status?: Driver['status']) {
    return this.transportService.listDrivers(req.user.tenantId, status);
  }

  @Get('drivers/:id')
  @ApiOperation({ summary: 'Get driver by ID' })
  getDriver(@Request() req: any, @Param('id') id: string) {
    return this.transportService.getDriver(req.user.tenantId, id);
  }

  @Patch('drivers/:id')
  @ApiOperation({ summary: 'Update a driver' })
  updateDriver(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateDriverDto>) {
    return this.transportService.updateDriver(req.user.tenantId, id, dto);
  }

  // ── Routes ────────────────────────────────────────────────────────────────

  @Post('routes')
  @ApiOperation({ summary: 'Create a route' })
  createRoute(@Request() req: any, @Body() dto: CreateRouteDto) {
    return this.transportService.createRoute({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('routes')
  @ApiOperation({ summary: 'List routes' })
  listRoutes(@Request() req: any) {
    return this.transportService.listRoutes(req.user.tenantId);
  }

  // ── Assignments ───────────────────────────────────────────────────────────

  @Post('assignments')
  @ApiOperation({ summary: 'Create a transport assignment' })
  createAssignment(@Request() req: any, @Body() dto: CreateTransportAssignmentDto) {
    return this.transportService.createAssignment({ ...dto, tenantId: req.user.tenantId });
  }

  @Get('assignments')
  @ApiOperation({ summary: 'List transport assignments' })
  @ApiQuery({ name: 'bookingId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listAssignments(
    @Request() req: any,
    @Query('bookingId') bookingId?: string,
    @Query('status') status?: TransportAssignment['status'],
  ) {
    return this.transportService.listAssignments(req.user.tenantId, { bookingId, status });
  }

  @Get('assignments/:id')
  @ApiOperation({ summary: 'Get assignment by ID' })
  getAssignment(@Request() req: any, @Param('id') id: string) {
    return this.transportService.getAssignment(req.user.tenantId, id);
  }

  @Patch('assignments/:id/status')
  @ApiOperation({ summary: 'Update assignment status' })
  updateStatus(
    @Request() req: any,
    @Param('id') id: string,
    @Body('status') status: TransportAssignment['status'],
  ) {
    return this.transportService.updateAssignmentStatus(req.user.tenantId, id, status);
  }

  // ── Tasreeh Permits ───────────────────────────────────────────────────────

  @Post('assignments/:id/tasreeh')
  @ApiOperation({ summary: 'Request Tasreeh permit for an assignment' })
  requestPermit(@Request() req: any, @Param('id') id: string) {
    return this.transportService.requestTasreehPermit(req.user.tenantId, id);
  }

  @Get('assignments/:id/tasreeh')
  @ApiOperation({ summary: 'List Tasreeh permits for an assignment' })
  getPermits(@Param('id') id: string) {
    return this.transportService.getPermitsByAssignment(id);
  }
}
