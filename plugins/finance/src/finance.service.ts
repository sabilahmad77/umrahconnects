import { Injectable, NotFoundException } from '@nestjs/common';

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'overdue' | 'cancelled' | 'refunded';
export type PaymentGateway = 'hyperpay' | 'stripe' | 'midtrans' | 'bank_transfer' | 'cash';
export type LedgerEntryType = 'debit' | 'credit';

export interface CreateInvoiceDto {
  bookingId: string;
  customerId: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    vatRate?: number;
  }>;
  dueDate: Date;
  notes?: string;
}

export interface Invoice extends CreateInvoiceDto {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  currency: string;
  paidAmount: number;
  zatcaHash?: string;
  zatcaUuid?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  gateway: PaymentGateway;
  gatewayRef?: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  baseAmount?: number;
  baseCurrency?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paidAt?: Date;
  createdAt: Date;
}

export interface LedgerEntry {
  id: string;
  tenantId: string;
  accountCode: string;
  accountName: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  referenceId: string;
  referenceType: 'invoice' | 'payment' | 'refund' | 'adjustment';
  description: string;
  postedAt: Date;
}

export interface CreateLedgerEntryDto {
  accountCode: string;
  accountName: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  referenceId: string;
  referenceType: LedgerEntry['referenceType'];
  description: string;
  postedAt?: Date;
}

export interface FxRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveAt: Date;
  source: string;
}

export interface FinancialSummary {
  tenantId: string;
  from: Date;
  to: Date;
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  totalRefunded: number;
  currency: string;
  invoiceCount: number;
  paymentCount: number;
  vatCollected: number;
}

export interface ZatcaInvoiceResult {
  invoiceId: string;
  zatcaUuid: string;
  zatcaHash: string;
  clearanceStatus: 'cleared' | 'reported' | 'rejected';
  qrCode: string;
  submittedAt: Date;
}

@Injectable()
export class FinanceService {
  /**
   * Create a new invoice for a tenant.
   * Computes subtotal, VAT, and total from line items.
   * Generates a sequential invoice number for the tenant.
   */
  async createInvoice(tenantId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    // TODO: implement - generate invoice number, calculate totals, persist to plugin_finance.invoices
    // TODO: if tenant KSA flag is set, queue ZATCA clearance job
    throw new Error('Not implemented');
  }

  /**
   * Record a payment against an invoice and update invoice status.
   * Handles multi-currency via FX rate lookup; creates double-entry ledger records.
   */
  async processPayment(
    tenantId: string,
    invoiceId: string,
    gateway: PaymentGateway,
    amount: number,
    currency: string,
  ): Promise<Payment> {
    // TODO: implement - validate invoice exists and is payable
    // TODO: lookup FX rate if currency != invoice currency
    // TODO: create payment record, update invoice.paidAmount + status
    // TODO: call recordLedgerEntry for debit (AR) and credit (revenue)
    throw new Error('Not implemented');
  }

  /**
   * Post a single double-entry ledger entry.
   * Used internally and exposed for manual adjustments.
   */
  async recordLedgerEntry(tenantId: string, entry: CreateLedgerEntryDto): Promise<LedgerEntry> {
    // TODO: implement - validate account codes, persist to plugin_finance.ledger_entries
    throw new Error('Not implemented');
  }

  /**
   * Aggregate financial metrics for a tenant within a date range.
   * Returns totals for invoiced, collected, outstanding, refunded, and VAT.
   */
  async getFinancialSummary(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<FinancialSummary> {
    // TODO: implement - aggregate SQL query over invoices and payments
    return {
      tenantId,
      from,
      to,
      totalInvoiced: 0,
      totalCollected: 0,
      totalOutstanding: 0,
      totalRefunded: 0,
      currency: 'SAR',
      invoiceCount: 0,
      paymentCount: 0,
      vatCollected: 0,
    };
  }

  /**
   * Submit an invoice to ZATCA for e-invoicing clearance (KSA Phase 2).
   * Calls ZatcaService.clearInvoice(), stores UUID and hash on the invoice.
   */
  async generateZatcaInvoice(tenantId: string, invoiceId: string): Promise<ZatcaInvoiceResult> {
    // TODO: implement - load invoice, build ZATCA UBL XML payload
    // TODO: call ZatcaService.clearInvoice(), update invoice with zatcaUuid + zatcaHash
    // TODO: store clearance result and QR code
    throw new NotFoundException(`Invoice ${invoiceId} not found`);
  }

  // ── Additional helpers ────────────────────────────────────────────────────

  async getInvoice(tenantId: string, invoiceId: string): Promise<Invoice> {
    // TODO: implement
    throw new NotFoundException(`Invoice ${invoiceId} not found`);
  }

  async listInvoices(
    tenantId: string,
    filters: { status?: InvoiceStatus; page?: number; limit?: number } = {},
  ): Promise<{ data: Invoice[]; total: number }> {
    // TODO: implement - paginated listing
    return { data: [], total: 0 };
  }

  async cancelInvoice(tenantId: string, invoiceId: string): Promise<Invoice> {
    // TODO: implement - void invoice, create reversing ledger entries
    throw new NotFoundException(`Invoice ${invoiceId} not found`);
  }

  async getLedgerEntries(
    tenantId: string,
    filters: { accountCode?: string; from?: Date; to?: Date } = {},
  ): Promise<LedgerEntry[]> {
    // TODO: implement - ledger query with date and account filters
    return [];
  }

  async upsertFxRate(tenantId: string, from: string, to: string, rate: number, source: string): Promise<FxRate> {
    // TODO: implement - upsert FX rate record
    throw new Error('Not implemented');
  }

  async getLatestFxRate(from: string, to: string): Promise<FxRate | null> {
    // TODO: implement - fetch latest effective FX rate
    return null;
  }
}
