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
import { VisaService, VisaStatus, VisaSystem } from './visa.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Visa')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/visa')
export class VisaController {
  constructor(private readonly visaService: VisaService) {}

  @Post('applications')
  @ApiOperation({ summary: 'Create a visa application for a pilgrim' })
  createApplication(
    @Request() req: any,
    @Body('pilgrimId') pilgrimId: string,
    @Body('bookingId') bookingId: string,
    @Body('system') system: VisaSystem,
  ) {
    return this.visaService.createApplication(req.user.tenantId, pilgrimId, bookingId, system);
  }

  @Get('applications')
  @ApiOperation({ summary: 'List visa applications' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'system', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listApplications(
    @Request() req: any,
    @Query('status') status?: VisaStatus,
    @Query('system') system?: VisaSystem,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.visaService.listApplications(req.user.tenantId, { status, system, page, limit });
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Get a visa application by ID' })
  getApplication(@Request() req: any, @Param('id') id: string) {
    return this.visaService.getApplication(req.user.tenantId, id);
  }

  @Get('bookings/:bookingId/applications')
  @ApiOperation({ summary: 'Get all visa applications for a booking' })
  getApplicationsByBooking(@Request() req: any, @Param('bookingId') bookingId: string) {
    return this.visaService.getApplicationsByBooking(req.user.tenantId, bookingId);
  }

  @Post('applications/:id/submit-nusuk')
  @ApiOperation({ summary: 'Submit visa application to Nusuk Masar' })
  submitToNusuk(@Param('id') id: string) {
    return this.visaService.submitToNusuk(id);
  }

  @Post('siskopatuh/submit-batch')
  @ApiOperation({ summary: 'Submit a batch of pilgrims to SISKOPATUH' })
  submitToSiskopatuh(@Request() req: any, @Body('pilgrimIds') pilgrimIds: string[]) {
    return this.visaService.submitToSiskopatuh(req.user.tenantId, pilgrimIds);
  }

  @Patch('applications/:id/status')
  @ApiOperation({ summary: 'Update visa application status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: VisaStatus,
    @Body('externalRef') externalRef?: string,
  ) {
    return this.visaService.updateStatus(id, status, externalRef);
  }

  @Post('applications/:id/poll-status')
  @ApiOperation({ summary: 'Poll Nusuk for latest visa status' })
  pollStatus(@Param('id') id: string) {
    return this.visaService.pollNusukStatus(id);
  }

  @Get('regulatory-submissions')
  @ApiOperation({ summary: 'List regulatory submissions' })
  @ApiQuery({ name: 'system', required: false })
  listSubmissions(@Request() req: any, @Query('system') system?: VisaSystem) {
    return this.visaService.listRegulatorySubmissions(req.user.tenantId, system);
  }
}
