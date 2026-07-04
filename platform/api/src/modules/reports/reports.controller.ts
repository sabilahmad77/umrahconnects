import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('overview')
  @RequirePermissions('finance:report:read')
  async getOverview(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getOverview(tenantId) };
  }
  @Get('pilgrims')
  @RequirePermissions('finance:report:read')
  async getPilgrimAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getPilgrimAnalytics(tenantId) };
  }
  @Get('bookings')
  @RequirePermissions('finance:report:read')
  async getBookingAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getBookingAnalytics(tenantId) };
  }
  @Get('hotels')
  @RequirePermissions('finance:report:read')
  async getHotelAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getHotelAnalytics(tenantId) };
  }
  @Get('finance')
  @RequirePermissions('finance:report:read')
  async getFinanceAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getFinanceAnalytics(tenantId) };
  }
  @Get('visa')
  @RequirePermissions('finance:report:read')
  async getVisaAnalytics(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getVisaAnalytics(tenantId) };
  }
}
