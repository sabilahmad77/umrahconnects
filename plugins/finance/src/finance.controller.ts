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
import { FinanceService, CreateInvoiceDto, PaymentGateway, InvoiceStatus, CreateLedgerEntryDto } from './finance.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ── Invoices ──────────────────────────────────────────────────────────────

  @Post('invoices')
  @ApiOperation({ summary: 'Create an invoice' })
  createInvoice(@Request() req: any, @Body() dto: CreateInvoiceDto) {
    return this.financeService.createInvoice(req.user.tenantId, dto);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listInvoices(
    @Request() req: any,
    @Query('status') status?: InvoiceStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.financeService.listInvoices(req.user.tenantId, { status, page, limit });
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  getInvoice(@Request() req: any, @Param('id') id: string) {
    return this.financeService.getInvoice(req.user.tenantId, id);
  }

  @Patch('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel an invoice' })
  cancelInvoice(@Request() req: any, @Param('id') id: string) {
    return this.financeService.cancelInvoice(req.user.tenantId, id);
  }

  @Post('invoices/:id/zatca')
  @ApiOperation({ summary: 'Submit invoice to ZATCA for e-invoicing clearance' })
  zatcaInvoice(@Request() req: any, @Param('id') id: string) {
    return this.financeService.generateZatcaInvoice(req.user.tenantId, id);
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  @Post('invoices/:id/payments')
  @ApiOperation({ summary: 'Record a payment against an invoice' })
  processPayment(
    @Request() req: any,
    @Param('id') invoiceId: string,
    @Body('gateway') gateway: PaymentGateway,
    @Body('amount') amount: number,
    @Body('currency') currency: string,
  ) {
    return this.financeService.processPayment(req.user.tenantId, invoiceId, gateway, amount, currency);
  }

  // ── Ledger ────────────────────────────────────────────────────────────────

  @Post('ledger')
  @ApiOperation({ summary: 'Post a ledger entry manually' })
  postLedgerEntry(@Request() req: any, @Body() dto: CreateLedgerEntryDto) {
    return this.financeService.recordLedgerEntry(req.user.tenantId, dto);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'List ledger entries' })
  @ApiQuery({ name: 'accountCode', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getLedgerEntries(
    @Request() req: any,
    @Query('accountCode') accountCode?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeService.getLedgerEntries(req.user.tenantId, {
      accountCode,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get financial summary for a date range' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getSummary(
    @Request() req: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.financeService.getFinancialSummary(req.user.tenantId, new Date(from), new Date(to));
  }

  // ── FX Rates ──────────────────────────────────────────────────────────────

  @Get('fx-rates/:from/:to')
  @ApiOperation({ summary: 'Get latest FX rate between two currencies' })
  getFxRate(@Param('from') from: string, @Param('to') to: string) {
    return this.financeService.getLatestFxRate(from, to);
  }
}
