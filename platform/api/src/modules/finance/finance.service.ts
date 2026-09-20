import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PayActor, PaymentsService } from '../payments/payments.service';
import { assertOwnedIfPresent, requireId } from '../../common/tenant-scope';
import { adjustBookingPaid } from '../bookings/booking-money';

/** Gateways driven by the payments module — refunds/edits must go through it. */
const PROVIDER_GATEWAYS = new Set(['sandbox', 'stripe']);
const SETTLED_PAYMENT_STATUSES = new Set(['COMPLETED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
/** Invoice statuses reachable through the generic PUT /finance/invoices/:id. */
const INVOICE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['ISSUED', 'SENT', 'CANCELLED', 'VOID'],
  ISSUED: ['DRAFT', 'SENT', 'OVERDUE', 'CANCELLED', 'VOID'],
  SENT: ['DRAFT', 'ISSUED', 'OVERDUE', 'CANCELLED', 'VOID'],
  OVERDUE: ['ISSUED', 'SENT', 'CANCELLED', 'VOID'],
  PARTIALLY_PAID: ['OVERDUE', 'CANCELLED', 'VOID'],
  PAID: [],
  CANCELLED: [],
  VOID: [],
};
/** Issued invoices that still expect money. */
const OPEN_INVOICE_STATUSES = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'];
/** Budget plan lifecycle. COMPLETED and CANCELLED are final. */
const PLAN_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PROPOSED', 'ACCEPTED', 'CANCELLED'],
  PROPOSED: ['DRAFT', 'ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
const PLAN_INITIAL_STATUSES = ['DRAFT', 'PROPOSED', 'ACCEPTED'];
const LOCKED_TX = { maxWait: 10_000, timeout: 20_000 };

type Tx = Prisma.TransactionClient;

/** The status an invoice carries once its paid total changed. VOID / CANCELLED keep theirs. */
function invoiceStatusFor(current: string, paid: bigint, total: bigint): string {
  if (current === 'VOID' || current === 'CANCELLED') return current;
  if (paid <= BigInt(0))
    return current === 'PAID' || current === 'PARTIALLY_PAID' ? 'ISSUED' : current;
  return paid >= total ? 'PAID' : 'PARTIALLY_PAID';
}

const toCents = (major: unknown): bigint =>
  major == null ? BigInt(0) : BigInt(Math.round(Number(major) * 100));

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private payments: PaymentsService,
  ) {}

  /**
   * Write an update that closes an invoice (VOID / CANCELLED). Card attempts still
   * open on it are cancelled at the payment provider and closed first, in the
   * section payments are opened and settled under (F1), so none of them can be
   * paid afterwards; a capture that still arrives is held for a refund.
   */
  private async closeInvoice(
    tenantId: string,
    current: { id: string; status: string },
    data: Prisma.InvoiceUpdateInput,
    actor?: PayActor,
  ) {
    return this.payments.closeWithOpenAttempts(
      {
        subject: 'invoice',
        lockKeys: [`pay:invoice:${current.id}`],
        attempts: { tenantId, invoiceId: current.id },
        reason: data.status === 'VOID' ? 'invoice voided' : 'invoice cancelled',
        actor,
      },
      {
        verify: async (tx) => {
          const fresh = await tx.invoice.findFirst({
            where: { id: current.id, tenantId },
            select: { status: true },
          });
          if (fresh?.status !== current.status) {
            throw new ConflictException('This invoice changed meanwhile. Refresh and try again.');
          }
        },
        apply: (tx) => tx.invoice.update({ where: { id: current.id }, data }),
      },
    );
  }

  private static closes(status: unknown) {
    return status === 'VOID' || status === 'CANCELLED';
  }

  private normalizeInvoice(inv: any): any {
    if (!inv) return inv;
    const address = inv.issuedToAddress;
    return {
      ...inv,
      subtotalCents: Number(inv.subtotalCents ?? 0),
      taxCents: Number(inv.taxCents ?? 0),
      discountCents: Number(inv.discountCents ?? 0),
      totalCents: Number(inv.totalCents ?? 0),
      paidCents: Number(inv.paidCents ?? 0),
      issuedToEmail:
        address && typeof address === 'object' && typeof address.email === 'string'
          ? address.email
          : null,
      ...(Array.isArray(inv.payments)
        ? { payments: inv.payments.map((p: any) => this.normalizePayment(p)) }
        : {}),
    };
  }

  /** Payment rows as the web sees them: numbers, never the provider's raw response. */
  private normalizePayment(p: any): any {
    if (!p) return p;
    const { gatewayResponse: _raw, ...rest } = p;
    return {
      ...rest,
      amountCents: Number(p.amountCents ?? 0),
      ...(p.refundedCents !== undefined ? { refundedCents: Number(p.refundedCents ?? 0) } : {}),
      ...(p.invoice?.totalCents !== undefined
        ? { invoice: { ...p.invoice, totalCents: Number(p.invoice.totalCents) } }
        : {}),
    };
  }

  /** Row lock on an invoice for this transaction: money on one invoice moves one event at a time. */
  private async lockInvoice(tx: Tx, id: string) {
    await tx.$executeRaw`SELECT 1 FROM plugin_finance.invoices WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private async lockPayment(tx: Tx, id: string) {
    await tx.$executeRaw`SELECT 1 FROM plugin_finance.payments WHERE id = ${id}::uuid FOR UPDATE`;
  }

  async findInvoices(tenantId: string, query: any) {
    const { status, type, search, bookingId, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: Prisma.InvoiceWhereInput = { tenantId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (bookingId) where.bookingId = bookingId;
    if (search) {
      where.OR = [
        { invoiceRef: { contains: String(search), mode: 'insensitive' } },
        { issuedToName: { contains: String(search), mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          payments: {
            select: { id: true, amountCents: true, status: true, gateway: true, paidAt: true },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      items: items.map((i) => this.normalizeInvoice(i)),
      total,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(total / +limit),
    };
  }

  async findOne(tenantId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: { payments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return this.normalizeInvoice(inv);
  }

  /**
   * Every party id on an invoice must resolve for the caller: bookings and
   * pilgrims inside the tenant; vendors either owned by the tenant or a
   * VERIFIED marketplace vendor (a read-only business link — never mutated).
   */
  private async assertInvoiceParties(tenantId: string, dto: any) {
    await assertOwnedIfPresent(this.prisma.booking, dto.bookingId, tenantId, 'Booking');
    await assertOwnedIfPresent(this.prisma.pilgrim, dto.pilgrimId, tenantId, 'Pilgrim', {
      deletedAt: null,
    });
    if (dto.vendorId !== undefined && dto.vendorId !== null && dto.vendorId !== '') {
      const vendorId = requireId(dto.vendorId, 'Vendor');
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: vendorId, OR: [{ tenantId }, { status: 'VERIFIED' as any }] },
        select: { id: true },
      });
      if (!vendor) throw new NotFoundException('Vendor not found');
    }
  }

  /** The billing address object, with the customer's email kept alongside it. */
  private issuedToAddress(dto: any, current?: unknown): Prisma.InputJsonValue | undefined {
    const base =
      dto.issuedToAddress !== undefined
        ? dto.issuedToAddress
        : current && typeof current === 'object'
          ? current
          : typeof current === 'string'
            ? { line1: current }
            : undefined;
    if (dto.counterpartyEmail === undefined) return base as Prisma.InputJsonValue | undefined;
    return { ...(base ?? {}), email: dto.counterpartyEmail } as Prisma.InputJsonValue;
  }

  async createInvoice(tenantId: string, dto: any, createdBy?: string) {
    await this.assertInvoiceParties(tenantId, dto);
    const invoiceRef = `INV-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const subtotalCents = BigInt(
      Math.round((dto.subtotal ?? dto.subtotalCents ?? 0) * (dto.subtotal ? 100 : 1)),
    );
    const taxCents = BigInt(Math.round((dto.tax ?? dto.taxCents ?? 0) * (dto.tax ? 100 : 1)));
    const discountCents = BigInt(Math.round(Number(dto.discountCents ?? 0)));
    if (subtotalCents < BigInt(0) || taxCents < BigInt(0) || discountCents < BigInt(0)) {
      throw new BadRequestException('Amounts must not be negative');
    }
    if (discountCents > subtotalCents + taxCents) {
      throw new BadRequestException('Discount must not exceed the invoice subtotal plus tax');
    }
    // Server-computed total; client-sent total/totalCents are ignored.
    const totalCents = subtotalCents + taxCents - discountCents;
    const dueAt = dto.dueAt ?? dto.dueDate;
    const issuedAt = dto.issuedAt ?? dto.issueDate;

    return this.normalizeInvoice(
      await this.prisma.invoice.create({
        data: {
          tenantId,
          invoiceRef,
          type: dto.type ?? 'CUSTOMER',
          bookingId: dto.bookingId,
          pilgrimId: dto.pilgrimId,
          vendorId: dto.vendorId,
          issuedToName: dto.issuedToName ?? dto.counterpartyName ?? dto.clientName ?? 'Unknown',
          issuedToAddress: this.issuedToAddress(dto),
          subtotalCents,
          taxCents,
          discountCents,
          totalCents,
          currency: String(dto.currency ?? 'SAR').toUpperCase(),
          // status is server-owned: a new invoice always starts as DRAFT (schema default)
          issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
          dueAt: dueAt ? new Date(dueAt) : undefined,
          lineItems: dto.lineItems ?? [],
          notes: dto.notes,
          createdBy,
        },
      }),
    );
  }

  /** DRAFT → ISSUED. An invoice that already carries money is issued as (partially) paid. */
  async issueInvoice(tenantId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'ISSUED') return current;
    // A voided, cancelled or paid invoice cannot be re-issued.
    this.assertInvoiceTransition(current, 'ISSUED');
    const status = invoiceStatusFor(
      'ISSUED',
      BigInt(current.paidCents),
      BigInt(current.totalCents),
    );
    return this.normalizeInvoice(
      await this.prisma.invoice.update({
        where: { id },
        data: {
          status: status as any,
          issuedAt: new Date(),
          ...(status === 'PAID' ? { paidAt: new Date() } : {}),
        },
      }),
    );
  }

  async voidInvoice(tenantId: string, id: string, actor?: PayActor) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'VOID') return current;
    this.assertInvoiceTransition(current, 'VOID');
    return this.normalizeInvoice(
      await this.closeInvoice(tenantId, current, { status: 'VOID' }, actor),
    );
  }

  /**
   * Record a manual payment (cash, bank transfer, card terminal…). Only issued
   * invoices take money; the amount is capped at the outstanding balance, read
   * under a row lock so two recordings cannot both fit the same balance. A
   * replayed idempotency key returns the first recording.
   */
  async recordPayment(tenantId: string, invoiceId: string, dto: any) {
    await this.findOne(tenantId, invoiceId);
    // Gateway payments are created only by the payments module (they are refundable through the provider).
    const gateway = String(dto.gateway ?? dto.method ?? 'cash');
    if (PROVIDER_GATEWAYS.has(gateway.toLowerCase())) {
      throw new BadRequestException('A manual payment cannot be recorded as a provider payment');
    }
    const amountCents = BigInt(
      Math.round((dto.amount ?? dto.amountCents ?? 0) * (dto.amount ? 100 : 1)),
    );
    if (amountCents <= BigInt(0))
      throw new BadRequestException('Payment amount must be greater than zero.');
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('The payment date cannot be in the future');
    }
    const clientKey = typeof dto.idempotencyKey === 'string' ? dto.idempotencyKey.trim() : '';

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockInvoice(tx, invoiceId);
      if (clientKey) {
        const existing = await tx.payment.findUnique({ where: { idempotencyKey: clientKey } });
        if (existing) {
          if (existing.tenantId !== tenantId || existing.invoiceId !== invoiceId) {
            throw new ConflictException('Idempotency key already used');
          }
          return { payment: existing, replay: true };
        }
      }
      const inv = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, tenantId } });
      if (inv.status === 'DRAFT') {
        throw new BadRequestException('Issue the invoice before recording a payment');
      }
      if (['VOID', 'CANCELLED'].includes(String(inv.status))) {
        throw new BadRequestException(`Invoice is ${inv.status} and cannot take payments`);
      }
      const currency = String(inv.currency ?? 'SAR');
      if (dto.currency && String(dto.currency).toUpperCase() !== currency.toUpperCase()) {
        throw new BadRequestException(`Currency must be ${currency}`);
      }
      // Server-authoritative: amount > 0 and ≤ outstanding.
      const total = BigInt(inv.totalCents);
      const outstanding = total - BigInt(inv.paidCents ?? 0);
      if (amountCents > outstanding) {
        const fmt = (c: bigint) => `${currency} ${(Number(c) / 100).toLocaleString()}`;
        throw new BadRequestException(
          outstanding <= BigInt(0)
            ? 'This invoice is already fully paid.'
            : `Amount exceeds the outstanding balance (${fmt(outstanding)}).`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          bookingId: inv.bookingId,
          pilgrimId: inv.pilgrimId,
          amountCents,
          currency,
          gateway,
          gatewayRef: dto.gatewayRef ?? dto.referenceNumber,
          status: 'COMPLETED',
          paidAt,
          idempotencyKey: clientKey || `pay-${invoiceId}-${randomUUID()}`,
        },
      });
      // Status is derived from the cumulative paid total, so two partial
      // payments that sum to the total reach PAID.
      const newPaid = BigInt(inv.paidCents ?? 0) + amountCents;
      const status = invoiceStatusFor(inv.status, newPaid, total);
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidCents: newPaid,
          status: status as any,
          paidAt: status === 'PAID' ? new Date() : null,
        },
      });
      if (inv.bookingId) await adjustBookingPaid(tx, inv.bookingId, amountCents);
      return { payment, replay: false, inv };
    }, LOCKED_TX);

    if (!outcome.replay && outcome.inv?.createdBy) {
      // Notification engine: payment-received event for the invoice creator
      this.notifications
        .fire({
          tenantId,
          recipientUserId: outcome.inv.createdBy,
          type: 'PAYMENT_RECEIVED',
          title: 'Payment received',
          body: `${outcome.payment.currency} ${(Number(amountCents) / 100).toLocaleString()} received for invoice ${outcome.inv.invoiceRef ?? invoiceId.slice(0, 8)}.`,
          link: '/finance',
        })
        .catch(() => undefined);
    }
    return { ...this.normalizePayment(outcome.payment), idempotentReplay: outcome.replay };
  }

  async findPayments(tenantId: string, query: any) {
    const { page = 1, limit = 20, status } = query;
    const skip = (+page - 1) * +limit;
    const where: Prisma.PaymentWhereInput = { tenantId, ...(status ? { status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: { invoice: { select: { invoiceRef: true, issuedToName: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: items.map((p) => this.normalizePayment(p)),
      total,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(total / +limit),
    };
  }

  /**
   * Organization totals in its main currency (SAR when it bills in SAR).
   * Figures in other currencies are reported separately, never added to it.
   */
  async getSummary(tenantId: string) {
    const groups = await this.prisma.invoice.groupBy({
      by: ['status', 'currency'],
      where: { tenantId },
      _sum: { totalCents: true, paidCents: true },
      _count: { _all: true },
    });
    const currencies = [...new Set(groups.map((g) => g.currency))];
    const currency =
      currencies.includes('SAR') || currencies.length === 0 ? 'SAR' : currencies.sort()[0];
    const tally = (cur: string) => {
      const rows = groups.filter((g) => g.currency === cur);
      const sum = (pick: (g: (typeof rows)[number]) => bigint, statuses?: string[]) =>
        rows
          .filter((g) => !statuses || statuses.includes(g.status))
          .reduce((s, g) => s + pick(g), BigInt(0));
      const count = (statuses: string[]) =>
        rows.filter((g) => statuses.includes(g.status)).reduce((s, g) => s + g._count._all, 0);
      const total = (g: (typeof rows)[number]) => BigInt(g._sum.totalCents ?? 0);
      const paid = (g: (typeof rows)[number]) => BigInt(g._sum.paidCents ?? 0);
      return {
        collected: sum(paid),
        paidCount: count(['PAID']),
        outstanding: sum((g) => total(g) - paid(g), OPEN_INVOICE_STATUSES),
        outstandingCount: count(OPEN_INVOICE_STATUSES),
        draft: sum(total, ['DRAFT']),
        draftCount: count(['DRAFT']),
      };
    };
    const main = tally(currency);
    return {
      currency,
      paid: { amountCents: Number(main.collected), count: main.paidCount },
      outstanding: { amountCents: Number(main.outstanding), count: main.outstandingCount },
      draft: { amountCents: Number(main.draft), count: main.draftCount },
      otherCurrencies: currencies
        .filter((c) => c !== currency)
        .map((c) => {
          const t = tally(c);
          return {
            currency: c,
            collectedCents: Number(t.collected),
            outstandingCents: Number(t.outstanding),
            draftCents: Number(t.draft),
          };
        }),
    };
  }

  // ── Invoice edit / status / delete ─────────────────────────────────────
  async updateInvoice(tenantId: string, id: string, dto: any, actor?: PayActor) {
    const current = await this.findOne(tenantId, id);
    await this.assertInvoiceParties(tenantId, {
      bookingId: dto.bookingId,
      pilgrimId: dto.pilgrimId,
      vendorId: dto.vendorId,
    });
    const data: any = {};
    if (
      dto.clientName !== undefined &&
      dto.issuedToName === undefined &&
      dto.counterpartyName === undefined
    ) {
      data.issuedToName = dto.clientName;
    }
    if (dto.issuedToName !== undefined) data.issuedToName = dto.issuedToName;
    if (dto.counterpartyName !== undefined) data.issuedToName = dto.counterpartyName;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.bookingId !== undefined) data.bookingId = dto.bookingId || null;
    if (dto.pilgrimId !== undefined) data.pilgrimId = dto.pilgrimId || null;
    if (dto.vendorId !== undefined) data.vendorId = dto.vendorId || null;
    if (dto.issuedToAddress !== undefined || dto.counterpartyEmail !== undefined) {
      data.issuedToAddress = this.issuedToAddress(dto, current.issuedToAddress);
    }
    const dueAt = dto.dueAt !== undefined ? dto.dueAt : dto.dueDate;
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (dto.status !== undefined && dto.status !== null && dto.status !== current.status) {
      this.assertInvoiceTransition(current, String(dto.status));
      data.status = dto.status;
      if (dto.status === 'ISSUED' && !current.issuedAt) data.issuedAt = new Date();
    }

    // What was billed is fixed once the invoice is issued: correct a mistake by
    // voiding it and issuing a new one, so a customer never sees a moving total.
    const touchesBilling =
      [
        dto.subtotal,
        dto.subtotalCents,
        dto.tax,
        dto.taxCents,
        dto.discountCents,
        dto.lineItems,
      ].some((v) => v !== undefined) ||
      (dto.currency !== undefined && String(dto.currency).toUpperCase() !== current.currency);
    if (touchesBilling && current.status !== 'DRAFT') {
      throw new BadRequestException(
        `Amounts, line items and currency of a ${current.status} invoice cannot change. Void it and issue a new one.`,
      );
    }
    if (dto.currency !== undefined) data.currency = String(dto.currency).toUpperCase();
    if (dto.lineItems !== undefined) data.lineItems = dto.lineItems;
    if (dto.subtotal !== undefined) data.subtotalCents = toCents(dto.subtotal);
    if (dto.subtotalCents !== undefined)
      data.subtotalCents = BigInt(Math.round(Number(dto.subtotalCents)));
    if (dto.tax !== undefined) data.taxCents = toCents(dto.tax);
    if (dto.taxCents !== undefined) data.taxCents = BigInt(Math.round(Number(dto.taxCents)));
    if (dto.discountCents !== undefined)
      data.discountCents = BigInt(Math.round(Number(dto.discountCents)));
    if (
      data.subtotalCents !== undefined ||
      data.taxCents !== undefined ||
      data.discountCents !== undefined
    ) {
      const sub = BigInt(data.subtotalCents ?? current.subtotalCents);
      const tax = BigInt(data.taxCents ?? current.taxCents);
      const discount = BigInt(data.discountCents ?? current.discountCents ?? 0);
      if (sub < BigInt(0) || tax < BigInt(0) || discount < BigInt(0)) {
        throw new BadRequestException('Amounts must not be negative');
      }
      if (discount > sub + tax)
        throw new BadRequestException('Discount must not exceed the invoice subtotal plus tax');
      const total = sub + tax - discount;
      if (total < BigInt(current.paidCents ?? 0)) {
        throw new BadRequestException('Invoice total cannot be lower than the amount already paid');
      }
      data.totalCents = total;
    }
    if (FinanceService.closes(data.status)) {
      return this.normalizeInvoice(await this.closeInvoice(tenantId, current, data, actor));
    }
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data }));
  }

  /**
   * Generic-update status changes: only valid lifecycle moves. PAID and
   * PARTIALLY_PAID are derived from recorded payments, never set by hand here.
   */
  private assertInvoiceTransition(current: any, next: string) {
    if (next === 'PAID' || next === 'PARTIALLY_PAID') {
      throw new BadRequestException(
        'Invoice payment status is derived from recorded payments — record a payment instead',
      );
    }
    const allowed = INVOICE_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Invoice cannot move from ${current.status} to ${next}`);
    }
    if (next === 'DRAFT' && BigInt(current.paidCents ?? 0) > BigInt(0)) {
      throw new BadRequestException('An invoice with recorded payments cannot return to DRAFT');
    }
  }

  /** Apply a paid-amount delta to an invoice (inside the caller's transaction) and re-derive its status. */
  private async adjustInvoicePaid(tx: Tx, invoiceId: string, tenantId: string, deltaCents: bigint) {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) return;
    let newPaid = BigInt(inv.paidCents) + deltaCents;
    if (newPaid < BigInt(0)) newPaid = BigInt(0);
    const status = invoiceStatusFor(inv.status, newPaid, BigInt(inv.totalCents));
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidCents: newPaid,
        status: status as any,
        paidAt: status === 'PAID' ? (inv.paidAt ?? new Date()) : null,
      },
    });
  }

  async setInvoiceStatus(tenantId: string, id: string, status: string, actor?: PayActor) {
    const current = await this.findOne(tenantId, id);
    if (status === current.status) return current;
    // Same lifecycle rules as PUT /finance/invoices/:id — PAID / PARTIALLY_PAID are derived from payments.
    this.assertInvoiceTransition(current, status);
    const patch: any = { status };
    if (status === 'ISSUED' && !current.issuedAt) patch.issuedAt = new Date();
    if (FinanceService.closes(status)) {
      return this.normalizeInvoice(await this.closeInvoice(tenantId, current, patch, actor));
    }
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: patch }));
  }

  /**
   * DELETE cancels a draft that was never issued. An issued invoice is a
   * document the customer may hold, so it is voided (finance:invoice:approve)
   * rather than quietly cancelled.
   */
  async deleteInvoice(tenantId: string, id: string, actor?: PayActor) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'CANCELLED') return current;
    if (current.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only a draft invoice can be cancelled here. This one is ${current.status}; void it instead.`,
      );
    }
    return this.normalizeInvoice(
      await this.closeInvoice(tenantId, current, { status: 'CANCELLED' as any }, actor),
    );
  }

  // ── Payment management ─────────────────────────────────────────────────
  async findOnePayment(tenantId: string, id: string) {
    const p = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: { invoice: { select: { invoiceRef: true, issuedToName: true, totalCents: true } } },
    });
    if (!p) throw new NotFoundException('Payment not found');
    return this.normalizePayment(p);
  }

  /**
   * Manual payment bookkeeping. Provider-driven payments (sandbox/stripe) are
   * read-only here; amounts change only while a manual payment is unsettled;
   * status moves keep the linked invoice's and booking's paid totals consistent.
   */
  async updatePayment(tenantId: string, id: string, dto: any) {
    const p0 = await this.findOnePayment(tenantId, id);
    const isProvider = PROVIDER_GATEWAYS.has(String(p0.gateway).toLowerCase());
    const touchesMoney =
      dto.status !== undefined ||
      dto.amount !== undefined ||
      dto.amountCents !== undefined ||
      dto.gateway !== undefined ||
      dto.method !== undefined;
    if (isProvider && touchesMoney) {
      throw new BadRequestException(
        'Gateway payments are managed by the payment provider — use /payments endpoints',
      );
    }
    const newGateway = dto.method ?? dto.gateway;
    if (newGateway !== undefined && PROVIDER_GATEWAYS.has(String(newGateway).toLowerCase())) {
      throw new BadRequestException('A manual payment cannot be re-labelled as a provider payment');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (p0.invoiceId) await this.lockInvoice(tx, p0.invoiceId);
      await this.lockPayment(tx, id);
      const p = await tx.payment.findUniqueOrThrow({ where: { id } });

      const data: any = {};
      if (dto.gateway !== undefined) data.gateway = dto.gateway;
      if (dto.method !== undefined) data.gateway = dto.method;
      if (dto.gatewayRef !== undefined) data.gatewayRef = dto.gatewayRef;
      if (dto.referenceNumber !== undefined) data.gatewayRef = dto.referenceNumber;
      if (dto.paidAt !== undefined) data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;

      let amount = BigInt(p.amountCents);
      if (dto.amount !== undefined || dto.amountCents !== undefined) {
        if (SETTLED_PAYMENT_STATUSES.has(p.status)) {
          throw new BadRequestException(`The amount of a ${p.status} payment cannot be changed`);
        }
        amount =
          dto.amountCents !== undefined
            ? BigInt(Math.round(Number(dto.amountCents)))
            : toCents(dto.amount);
        if (amount <= BigInt(0))
          throw new BadRequestException('Payment amount must be greater than zero');
        data.amountCents = amount;
      }

      const prevStatus = p.status as string;
      const nextStatus =
        dto.status !== undefined && dto.status !== null ? String(dto.status) : prevStatus;
      let delta = BigInt(0);
      if (nextStatus !== prevStatus) {
        if (nextStatus === 'REFUNDED' || nextStatus === 'PARTIALLY_REFUNDED') {
          throw new BadRequestException(
            'Use POST /finance/payments/:id/refund to refund a payment',
          );
        }
        if (prevStatus === 'REFUNDED' || prevStatus === 'PARTIALLY_REFUNDED') {
          throw new BadRequestException(`A ${prevStatus} payment cannot change status`);
        }
        if (nextStatus === 'DISPUTED' || prevStatus === 'DISPUTED') {
          throw new BadRequestException('Disputes are recorded by the payment provider');
        }
        if (nextStatus === 'COMPLETED') {
          // Settling a payment: it must fit the invoice's outstanding balance.
          if (p.invoiceId) {
            const inv = await tx.invoice.findFirst({ where: { id: p.invoiceId, tenantId } });
            if (inv) {
              if (inv.status === 'DRAFT' || inv.status === 'VOID' || inv.status === 'CANCELLED') {
                throw new BadRequestException(`Invoice is ${inv.status} and cannot take payments`);
              }
              const outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents);
              if (amount > outstanding) {
                throw new BadRequestException(
                  'Payment amount exceeds the invoice outstanding balance',
                );
              }
            }
          }
          delta = amount;
          if (data.paidAt === undefined && !p.paidAt) data.paidAt = new Date();
        } else if (prevStatus === 'COMPLETED') {
          // Un-settling a manual payment removes it from the paid totals.
          delta = -(amount - BigInt(p.refundedCents ?? 0));
        }
        data.status = nextStatus;
        if (nextStatus === 'FAILED') data.failedAt = new Date();
      }

      const row = await tx.payment.update({ where: { id }, data });
      if (delta !== BigInt(0)) {
        if (p.invoiceId) await this.adjustInvoicePaid(tx, p.invoiceId, tenantId, delta);
        if (p.bookingId) await adjustBookingPaid(tx, p.bookingId, delta);
      }
      return row;
    }, LOCKED_TX);
    return this.normalizePayment(updated);
  }

  /**
   * Refund a manual (non-provider) payment. Capped at the refundable balance
   * (amount − already refunded); partial refunds accumulate. The payment row is
   * locked so two refunds cannot both fit the same balance.
   */
  async refundPayment(tenantId: string, id: string, amount?: number) {
    const p0 = await this.findOnePayment(tenantId, id);
    if (PROVIDER_GATEWAYS.has(String(p0.gateway).toLowerCase())) {
      throw new BadRequestException(
        'Gateway payments must be refunded through POST /payments/:id/refund',
      );
    }
    const { updated, refundCents } = await this.prisma.$transaction(async (tx) => {
      if (p0.invoiceId) await this.lockInvoice(tx, p0.invoiceId);
      await this.lockPayment(tx, id);
      const p = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (p.status !== 'COMPLETED' && p.status !== 'PARTIALLY_REFUNDED') {
        throw new BadRequestException('Only a completed payment can be refunded');
      }
      const already = BigInt(p.refundedCents ?? 0);
      const remaining = BigInt(p.amountCents) - already;
      if (remaining <= BigInt(0))
        throw new BadRequestException('Payment is already fully refunded');
      const refundCents = amount != null ? toCents(amount) : remaining;
      if (refundCents <= BigInt(0))
        throw new BadRequestException('Refund amount must be greater than zero');
      if (refundCents > remaining) {
        throw new BadRequestException(
          `Refund exceeds the refundable balance (${Number(remaining) / 100} ${p.currency})`,
        );
      }
      const totalRefunded = already + refundCents;
      const row = await tx.payment.update({
        where: { id },
        data: {
          status: (totalRefunded >= BigInt(p.amountCents)
            ? 'REFUNDED'
            : 'PARTIALLY_REFUNDED') as any,
          refundedCents: totalRefunded,
          refundedAt: new Date(),
        },
      });
      // Roll back the invoice and booking paid amounts by the refunded delta only.
      if (p.invoiceId) await this.adjustInvoicePaid(tx, p.invoiceId, tenantId, -refundCents);
      if (p.bookingId) await adjustBookingPaid(tx, p.bookingId, -refundCents);
      return { updated: row, refundCents };
    }, LOCKED_TX);

    if (p0.invoiceId) {
      const inv2 = await this.prisma.invoice.findFirst({ where: { id: p0.invoiceId, tenantId } });
      if (inv2?.createdBy) {
        // Notification engine: refund event for the invoice creator
        this.notifications
          .fire({
            tenantId,
            recipientUserId: inv2.createdBy,
            type: 'PAYMENT_RECEIVED',
            title: 'Payment refunded',
            body: `${updated.currency} ${(Number(refundCents) / 100).toLocaleString()} refunded on invoice ${inv2.invoiceRef ?? p0.invoiceId.slice(0, 8)}.`,
            link: '/finance-payments',
          })
          .catch(() => undefined);
      }
    }
    return this.normalizePayment(updated);
  }

  // ── Finance Manager dashboard stats ────────────────────────────────────
  async getDashboardStats(tenantId: string) {
    const summary = await this.getSummary(tenantId);
    const currency = summary.currency;
    const [
      partialCount,
      overdueCount,
      sentCount,
      recentPayments,
      financedBookings,
      plans,
      marketplace,
    ] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId, status: 'PARTIALLY_PAID' as any, currency } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'OVERDUE' as any, currency } }),
      this.prisma.invoice.count({
        where: { tenantId, status: { in: ['ISSUED', 'SENT'] as any }, currency },
      }),
      this.prisma.payment.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { invoice: { select: { invoiceRef: true, issuedToName: true } } },
      }),
      this.prisma.invoice.count({ where: { tenantId, bookingId: { not: null } } }),
      this.prisma.budgetPlan.findMany({
        where: { tenantId },
        select: { status: true, commissionCents: true, currency: true },
      }),
      // Card payments travelers made for this organization's marketplace bookings.
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          currency,
          listingBookingId: { not: null },
          status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] as any },
        },
        _sum: { amountCents: true, refundedCents: true },
        _count: { _all: true },
      }),
    ]);
    const activeBudgetPlans = plans.filter((p) =>
      ['PROPOSED', 'ACCEPTED'].includes(p.status),
    ).length;
    const commissionEarned = plans
      .filter((p) => ['ACCEPTED', 'COMPLETED'].includes(p.status) && p.currency === currency)
      .reduce((s, p) => s + Number(p.commissionCents), 0);
    return {
      ...summary,
      partialCount,
      overdueCount,
      sentCount,
      financedBookings,
      budgetPlans: { total: plans.length, active: activeBudgetPlans },
      commissionEarnedCents: commissionEarned,
      marketplace: {
        amountCents:
          Number(marketplace._sum.amountCents ?? 0) - Number(marketplace._sum.refundedCents ?? 0),
        count: marketplace._count._all,
      },
      recentTransactions: recentPayments.map((p: any) => ({
        id: p.id,
        amountCents: Number(p.amountCents),
        currency: p.currency,
        gateway: p.gateway,
        status: p.status,
        invoiceRef: p.invoice?.invoiceRef,
        counterparty:
          p.invoice?.issuedToName ?? (p.listingBookingId ? 'Marketplace booking' : undefined),
        paidAt: p.paidAt,
      })),
    };
  }

  // ── Budget Plans ───────────────────────────────────────────────────────
  private normalizePlan(p: any): any {
    if (!p) return p;
    return {
      ...p,
      totalBudgetCents: Number(p.totalBudgetCents ?? 0),
      hotelBudgetCents: Number(p.hotelBudgetCents ?? 0),
      transportBudgetCents: Number(p.transportBudgetCents ?? 0),
      visaBudgetCents: Number(p.visaBudgetCents ?? 0),
      packageBudgetCents: Number(p.packageBudgetCents ?? 0),
      otherBudgetCents: Number(p.otherBudgetCents ?? 0),
      commissionCents: Number(p.commissionCents ?? 0),
      commissionRate: p.commissionRate != null ? Number(p.commissionRate) : null,
    };
  }

  async findBudgetPlans(tenantId: string, query: any = {}) {
    const { status, page = 1, limit = 50 } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.budgetPlan.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.budgetPlan.count({ where }),
    ]);
    return {
      items: items.map((p) => this.normalizePlan(p)),
      total,
      page: +page,
      limit: +limit,
      totalPages: Math.ceil(total / +limit),
    };
  }

  async findBudgetPlan(tenantId: string, id: string) {
    const p = await this.prisma.budgetPlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Budget plan not found');
    return this.normalizePlan(p);
  }

  private assertPlanDates(dateFrom?: string | Date | null, dateTo?: string | Date | null) {
    if (dateFrom && dateTo && new Date(dateTo).getTime() < new Date(dateFrom).getTime()) {
      throw new BadRequestException('The travel end date cannot be before the start date');
    }
  }

  async createBudgetPlan(tenantId: string, dto: any, createdBy?: string) {
    const status = String(dto.status ?? 'DRAFT').toUpperCase();
    if (!PLAN_INITIAL_STATUSES.includes(status)) {
      throw new BadRequestException(
        `A new budget plan starts as one of: ${PLAN_INITIAL_STATUSES.join(', ')}`,
      );
    }
    this.assertPlanDates(dto.dateFrom, dto.dateTo);
    const planRef = `BP-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const hotel = toCents(dto.hotelBudget);
    const transport = toCents(dto.transportBudget);
    const visa = toCents(dto.visaBudget);
    const pkg = toCents(dto.packageBudget);
    const other = toCents(dto.otherBudget);
    const total =
      dto.totalBudget != null ? toCents(dto.totalBudget) : hotel + transport + visa + pkg + other;
    const commissionRate = dto.commissionRate != null ? Number(dto.commissionRate) : null;
    const commissionCents =
      dto.commission != null
        ? toCents(dto.commission)
        : commissionRate != null
          ? BigInt(Math.round(Number(total) * (commissionRate / 100)))
          : BigInt(0);
    const plan = await this.prisma.budgetPlan.create({
      data: {
        tenantId,
        planRef,
        clientUserId: dto.clientUserId ?? null,
        clientName: dto.clientName ?? 'Client',
        clientType: String(dto.clientType ?? 'TRAVELER').toUpperCase(),
        requestId: dto.requestId ?? null,
        destination: dto.destination,
        dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : null,
        dateTo: dto.dateTo ? new Date(dto.dateTo) : null,
        travelers: dto.travelers != null ? Number(dto.travelers) : 1,
        currency: String(dto.currency ?? 'SAR').toUpperCase(),
        totalBudgetCents: total,
        hotelBudgetCents: hotel,
        transportBudgetCents: transport,
        visaBudgetCents: visa,
        packageBudgetCents: pkg,
        otherBudgetCents: other,
        commissionRate: commissionRate ?? undefined,
        commissionCents,
        suggestedOptions: dto.suggestedOptions ?? [],
        finalPlan: dto.finalPlan ?? undefined,
        status,
        notes: dto.notes,
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    return this.normalizePlan(plan);
  }

  async updateBudgetPlan(tenantId: string, id: string, dto: any) {
    const current = await this.findBudgetPlan(tenantId, id);
    if (PLAN_TRANSITIONS[current.status]?.length === 0) {
      throw new BadRequestException(`A ${current.status} budget plan cannot be changed`);
    }
    const data: any = {};
    for (const k of ['clientName', 'destination', 'notes', 'suggestedOptions', 'finalPlan']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.currency !== undefined) data.currency = String(dto.currency).toUpperCase();
    if (dto.clientType !== undefined) data.clientType = String(dto.clientType).toUpperCase();
    if (dto.status !== undefined) {
      const next = String(dto.status).toUpperCase();
      if (next !== current.status && !(PLAN_TRANSITIONS[current.status] ?? []).includes(next)) {
        throw new BadRequestException(
          `A budget plan cannot move from ${current.status} to ${next}`,
        );
      }
      data.status = next;
    }
    if (dto.travelers !== undefined) data.travelers = Number(dto.travelers);
    if (dto.dateFrom !== undefined) data.dateFrom = dto.dateFrom ? new Date(dto.dateFrom) : null;
    if (dto.dateTo !== undefined) data.dateTo = dto.dateTo ? new Date(dto.dateTo) : null;
    this.assertPlanDates(
      dto.dateFrom !== undefined ? dto.dateFrom : current.dateFrom,
      dto.dateTo !== undefined ? dto.dateTo : current.dateTo,
    );
    if (dto.hotelBudget !== undefined) data.hotelBudgetCents = toCents(dto.hotelBudget);
    if (dto.transportBudget !== undefined) data.transportBudgetCents = toCents(dto.transportBudget);
    if (dto.visaBudget !== undefined) data.visaBudgetCents = toCents(dto.visaBudget);
    if (dto.packageBudget !== undefined) data.packageBudgetCents = toCents(dto.packageBudget);
    if (dto.otherBudget !== undefined) data.otherBudgetCents = toCents(dto.otherBudget);
    if (dto.totalBudget !== undefined) data.totalBudgetCents = toCents(dto.totalBudget);
    if (dto.commissionRate !== undefined)
      data.commissionRate = dto.commissionRate != null ? Number(dto.commissionRate) : null;
    if (dto.commission !== undefined) {
      data.commissionCents = toCents(dto.commission);
    } else if (dto.commissionRate !== undefined || dto.totalBudget !== undefined) {
      // Commission follows the rate: recompute it whenever the rate or the total changes.
      const rate = dto.commissionRate !== undefined ? dto.commissionRate : current.commissionRate;
      const total = data.totalBudgetCents ?? BigInt(current.totalBudgetCents);
      data.commissionCents =
        rate != null ? BigInt(Math.round(Number(total) * (Number(rate) / 100))) : BigInt(0);
    }
    const plan = await this.prisma.budgetPlan.update({ where: { id }, data });
    return this.normalizePlan(plan);
  }

  /** "Delete" cancels the plan; a completed plan is kept as it is. */
  async deleteBudgetPlan(tenantId: string, id: string) {
    const current = await this.findBudgetPlan(tenantId, id);
    if (current.status === 'CANCELLED') return current;
    if (current.status === 'COMPLETED')
      throw new BadRequestException('A completed budget plan cannot be cancelled');
    return this.normalizePlan(
      await this.prisma.budgetPlan.update({ where: { id }, data: { status: 'CANCELLED' } }),
    );
  }
}
