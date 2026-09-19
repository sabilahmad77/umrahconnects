import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FinanceService } from './finance.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { Principal } from '../auth/principal';
import {
  CreateBudgetPlanDto,
  CreateInvoiceDto,
  QueryBudgetPlansDto,
  QueryInvoicesDto,
  QueryPaymentsDto,
  RecordPaymentDto,
  RefundPaymentDto,
  SetInvoiceStatusDto,
  UpdateBudgetPlanDto,
  UpdateInvoiceDto,
  UpdatePaymentDto,
} from './dto/finance.dto';

@ApiTags('finance')
@Controller({ path: 'finance', version: '1' })
@ApiBearerAuth()
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  // ── Invoices ───────────────────────────────────────────────────────────
  @Get('invoices')
  @RequirePermissions('finance:invoice:read')
  async findInvoices(@TenantId() tenantId: string, @Query() query: QueryInvoicesDto) {
    return { success: true, data: await this.service.findInvoices(tenantId, query) };
  }

  @Post('invoices')
  @RequirePermissions('finance:invoice:create')
  async createInvoice(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: CreateInvoiceDto) {
    return { success: true, data: await this.service.createInvoice(tenantId, dto, user?.sub) };
  }

  @Get('invoices/:id')
  @RequirePermissions('finance:invoice:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @Put('invoices/:id')
  @RequirePermissions('finance:invoice:create')
  async updateInvoice(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto) {
    return { success: true, data: await this.service.updateInvoice(tenantId, id, dto) };
  }

  @Put('invoices/:id/status')
  @RequirePermissions('finance:invoice:approve')
  async setStatus(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: SetInvoiceStatusDto) {
    return { success: true, data: await this.service.setInvoiceStatus(tenantId, id, body.status) };
  }

  @Put('invoices/:id/issue')
  @RequirePermissions('finance:invoice:approve')
  async issue(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.issueInvoice(tenantId, id) };
  }

  @Put('invoices/:id/void')
  @RequirePermissions('finance:invoice:approve')
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
  async recordPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordPaymentDto) {
    return { success: true, data: await this.service.recordPayment(tenantId, id, dto) };
  }

  // ── Payments ───────────────────────────────────────────────────────────
  @Get('payments')
  @RequirePermissions('finance:payment:read')
  async findPayments(@TenantId() tenantId: string, @Query() query: QueryPaymentsDto) {
    return { success: true, data: await this.service.findPayments(tenantId, query) };
  }

  @Get('payments/:id')
  @RequirePermissions('finance:payment:read')
  async findPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOnePayment(tenantId, id) };
  }

  @Put('payments/:id')
  @RequirePermissions('finance:payment:process')
  async updatePayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentDto) {
    return { success: true, data: await this.service.updatePayment(tenantId, id, dto) };
  }

  @Post('payments/:id/refund')
  @RequirePermissions('finance:payment:refund')
  async refundPayment(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: RefundPaymentDto) {
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
  async findBudgetPlans(@TenantId() tenantId: string, @Query() query: QueryBudgetPlansDto) {
    return { success: true, data: await this.service.findBudgetPlans(tenantId, query) };
  }

  @Post('budget-plans')
  @RequirePermissions('finance:invoice:create')
  async createBudgetPlan(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: CreateBudgetPlanDto) {
    return { success: true, data: await this.service.createBudgetPlan(tenantId, dto, user?.sub) };
  }

  @Get('budget-plans/:id')
  @RequirePermissions('finance:report:read')
  async findBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findBudgetPlan(tenantId, id) };
  }

  @Put('budget-plans/:id')
  @RequirePermissions('finance:invoice:create')
  async updateBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetPlanDto) {
    return { success: true, data: await this.service.updateBudgetPlan(tenantId, id, dto) };
  }

  @Delete('budget-plans/:id')
  @RequirePermissions('finance:invoice:create')
  async deleteBudgetPlan(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deleteBudgetPlan(tenantId, id) };
  }
}
