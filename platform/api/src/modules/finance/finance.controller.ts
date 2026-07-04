import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

@ApiTags('finance')
@Controller({ path: 'finance', version: '1' })
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  // ── Invoices ───────────────────────────────────────────────────────────
  @Get('invoices')
  @RequirePermissions('finance:invoice:read')
  async findInvoices(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findInvoices(tenantId, query) };
  }

  @Post('invoices')
  @RequirePermissions('finance:invoice:create')
  async createInvoice(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: any) {
    return { success: true, data: await this.service.createInvoice(tenantId, dto, user?.sub) };
  }

  @Get('invoices/:id')
  @RequirePermissions('finance:invoice:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @Put('invoices/:id')
  @RequirePermissions('finance:invoice:create')
  async updateInvoice(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateInvoice(tenantId, id, dto) };
  }

  @Put('invoices/:id/status')
  @RequirePermissions('finance:invoice:create')
  async setStatus(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { status: string }) {
    return { success: true, data: await this.service.setInvoiceStatus(tenantId, id, body.status) };
  }

  @Put('invoices/:id/issue')
  @RequirePermissions('finance:invoice:create')
  async issue(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.issueInvoice(tenantId, id) };
  }

  @Put('invoices/:id/void')
  @RequirePermissions('finance:invoice:create')
  async void(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.voidInvoice(tenantId, id) };
  }

  @Delete('invoices/:id')
  @RequirePermissions('finance:invoice:create')
  async deleteInvoice(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteInvoice(tenantId, id) };
  }

  @Post('invoices/:id/payments')
  @RequirePermissions('finance:payment:process')
  async recordPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.recordPayment(tenantId, id, dto) };
  }

  // ── Payments ───────────────────────────────────────────────────────────
  @Get('payments')
  @RequirePermissions('finance:invoice:read')
  async findPayments(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findPayments(tenantId, query) };
  }

  @Get('payments/:id')
  @RequirePermissions('finance:invoice:read')
  async findPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOnePayment(tenantId, id) };
  }

  @Put('payments/:id')
  @RequirePermissions('finance:payment:process')
  async updatePayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.updatePayment(tenantId, id, dto) };
  }

  @Post('payments/:id/refund')
  @RequirePermissions('finance:payment:process')
  async refundPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { amount?: number }) {
    return { success: true, data: await this.service.refundPayment(tenantId, id, body?.amount) };
  }

  // ── Summary / dashboard ────────────────────────────────────────────────
  @Get('summary')
  @RequirePermissions('finance:report:read')
  async getSummary(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getSummary(tenantId) };
  }

  @Get('stats')
  @RequirePermissions('finance:report:read')
  async getStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getSummary(tenantId) };
  }

  @Get('dashboard-stats')
  @RequirePermissions('finance:report:read')
  async getDashboardStats(@TenantId() tenantId: string) {
    return { success: true, data: await this.service.getDashboardStats(tenantId) };
  }

  // ── Budget plans ───────────────────────────────────────────────────────
  @Get('budget-plans')
  @RequirePermissions('finance:report:read')
  async findBudgetPlans(@TenantId() tenantId: string, @Query() query: any) {
    return { success: true, data: await this.service.findBudgetPlans(tenantId, query) };
  }

  @Post('budget-plans')
  @RequirePermissions('finance:invoice:create')
  async createBudgetPlan(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: any) {
    return { success: true, data: await this.service.createBudgetPlan(tenantId, dto, user?.sub) };
  }

  @Get('budget-plans/:id')
  @RequirePermissions('finance:report:read')
  async findBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findBudgetPlan(tenantId, id) };
  }

  @Put('budget-plans/:id')
  @RequirePermissions('finance:invoice:create')
  async updateBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return { success: true, data: await this.service.updateBudgetPlan(tenantId, id, dto) };
  }

  @Delete('budget-plans/:id')
  @RequirePermissions('finance:invoice:create')
  async deleteBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteBudgetPlan(tenantId, id) };
  }
}
