import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacService } from '../rbac/rbac.service';

/**
 * Organization reports. Operational figures (travelers, bookings, hotels, visas,
 * transport) need reporting:report:read; money figures need finance:report:read,
 * so an account holding only the operational grant gets the same report without
 * the financial fields. Exports additionally need reporting:report:export.
 */
@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
@ApiBearerAuth()
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly rbac: RbacService,
  ) {}

  /** Whether the caller may see money figures (the guard has already loaded its capability set). */
  private async canReadFinance(req: any) {
    return (await this.rbac.permissionsFor(req)).has('finance:report:read');
  }

  @Get('overview')
  @RequirePermissions('reporting:report:read')
  async getOverview(@TenantId() tenantId: string, @Req() req: any) {
    return { success: true, data: await this.service.getOverview(tenantId, { includeFinance: await this.canReadFinance(req) }) };
  }

  @Get('pilgrims')
  @RequirePermissions('reporting:report:read')
  async getPilgrimAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getPilgrimAnalytics(tenantId) };
  }

  @Get('bookings')
  @RequirePermissions('reporting:report:read')
  async getBookingAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getBookingAnalytics(tenantId) };
  }

  @Get('hotels')
  @RequirePermissions('reporting:report:read')
  async getHotelAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getHotelAnalytics(tenantId) };
  }

  @Get('visa')
  @RequirePermissions('reporting:report:read')
  async getVisaAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getVisaAnalytics(tenantId) };
  }

  @Get('transport')
  @RequirePermissions('reporting:report:read')
  async getTransportAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getTransportAnalytics(tenantId) };
  }

  @Get('finance')
  @RequirePermissions('finance:report:read')
  async getFinanceAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getFinanceAnalytics(tenantId) };
  }

  /** CSV of every section the caller may read (the finance section only with finance:report:read). */
  @Get('export')
  @RequirePermissions('reporting:report:read', 'reporting:report:export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async export(@TenantId() tenantId: string, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const csv = await this.service.exportCsv(tenantId, { includeFinance: await this.canReadFinance(req) });
    res.setHeader('Content-Disposition', `attachment; filename="umrah-connect-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  }
}
