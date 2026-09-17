import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertOwnedIfPresent, requireId } from '../../common/tenant-scope';

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

@Injectable()
export class FinanceService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private normalizeInvoice(inv: any): any {
    if (!inv) return inv;
    return {
      ...inv,
      subtotalCents: Number(inv.subtotalCents ?? 0),
      taxCents: Number(inv.taxCents ?? 0),
      discountCents: Number(inv.discountCents ?? 0),
      totalCents: Number(inv.totalCents ?? 0),
      paidCents: Number(inv.paidCents ?? 0),
    };
  }

  async findInvoices(tenantId: string, query: any) {
    const { status, type, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (type) where.type = type;
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, skip, take: +limit, orderBy: { createdAt: 'desc' }, include: { payments: { select: { id: true, amountCents: true, status: true, gateway: true, paidAt: true } } } }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items: items.map(this.normalizeInvoice), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(tenantId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId }, include: { payments: true } });
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
    await assertOwnedIfPresent(this.prisma.pilgrim, dto.pilgrimId, tenantId, 'Pilgrim', { deletedAt: null });
    if (dto.vendorId !== undefined && dto.vendorId !== null && dto.vendorId !== '') {
      const vendorId = requireId(dto.vendorId, 'Vendor');
      const vendor = await this.prisma.vendor.findFirst({
        where: { id: vendorId, OR: [{ tenantId }, { status: 'VERIFIED' as any }] },
        select: { id: true },
      });
      if (!vendor) throw new NotFoundException('Vendor not found');
    }
  }

  async createInvoice(tenantId: string, dto: any, createdBy?: string) {
    await this.assertInvoiceParties(tenantId, dto);
    const invoiceRef = `INV-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const subtotalCents = BigInt(Math.round((dto.subtotal ?? dto.subtotalCents ?? 0) * (dto.subtotal ? 100 : 1)));
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

    return this.normalizeInvoice(await this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceRef,
        type: dto.type ?? 'CUSTOMER',
        bookingId: dto.bookingId,
        pilgrimId: dto.pilgrimId,
        vendorId: dto.vendorId,
        issuedToName: dto.issuedToName ?? dto.counterpartyName ?? dto.clientName ?? 'Unknown',
        issuedToAddress: dto.issuedToAddress ?? undefined,
        subtotalCents,
        taxCents,
        discountCents,
        totalCents,
        currency: dto.currency ?? 'SAR',
        // status is server-owned: a new invoice always starts as DRAFT (schema default)
        issuedAt: issuedAt ? new Date(issuedAt) : new Date(),
        dueAt: dueAt ? new Date(dueAt) : undefined,
        lineItems: dto.lineItems ?? [],
        notes: dto.notes,
        createdBy,
      },
    }));
  }

  async issueInvoice(tenantId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'ISSUED') return current;
    // A voided, cancelled or paid invoice cannot be re-issued.
    this.assertInvoiceTransition(current, 'ISSUED');
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } }));
  }

  async voidInvoice(tenantId: string, id: string) {
    const current = await this.findOne(tenantId, id);
    if (current.status === 'VOID') return current;
    this.assertInvoiceTransition(current, 'VOID');
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: { status: 'VOID' } }));
  }

  async recordPayment(tenantId: string, invoiceId: string, dto: any) {
    const inv = await this.findOne(tenantId, invoiceId);
    if (['VOID', 'CANCELLED'].includes(String(inv.status))) {
      throw new BadRequestException(`Invoice is ${inv.status} and cannot take payments`);
    }
    // Gateway payments are created only by the payments module (they are refundable through the provider).
    const gateway = String(dto.gateway ?? dto.method ?? 'cash');
    if (PROVIDER_GATEWAYS.has(gateway.toLowerCase())) {
      throw new BadRequestException('A manual payment cannot be recorded as a provider payment');
    }
    const currency = String(inv.currency ?? 'SAR');
    if (dto.currency && String(dto.currency).toUpperCase() !== currency.toUpperCase()) {
      throw new BadRequestException(`Currency must be ${currency}`);
    }
    const amountCents = BigInt(Math.round((dto.amount ?? dto.amountCents ?? 0) * (dto.amount ? 100 : 1)));

    // FIX-06: server-authoritative validation — amount > 0 and ≤ outstanding.
    const outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents ?? 0);
    if (amountCents <= BigInt(0)) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }
    if (amountCents > outstanding) {
      const fmt = (c: bigint) => `${inv.currency ?? 'SAR'} ${(Number(c) / 100).toLocaleString()}`;
      throw new BadRequestException(
        outstanding <= BigInt(0)
          ? 'This invoice is already fully paid.'
          : `Amount exceeds the outstanding balance (${fmt(outstanding)}).`,
      );
    }

    const idempotencyKey = dto.idempotencyKey ?? `pay-${invoiceId}-${Date.now()}`;

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId,
        amountCents,
        currency,
        gateway,
        gatewayRef: dto.gatewayRef ?? dto.referenceNumber,
        status: 'COMPLETED',
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        idempotencyKey,
      },
    });

    // FIX-06: derive invoice status from the CUMULATIVE paid total (so two partial
    // payments that sum to the total correctly reach PAID), not the single amount.
    const newPaid = BigInt(inv.paidCents ?? 0) + amountCents;
    const total = BigInt(inv.totalCents);
    const derivedStatus = newPaid >= total ? 'PAID' : newPaid > BigInt(0) ? 'PARTIALLY_PAID' : (inv.status as any);
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidCents: { increment: amountCents },
        paidAt: newPaid >= total ? new Date() : (inv as any).paidAt ?? undefined,
        status: derivedStatus,
      },
    });

    // Notification engine: payment-received event for the invoice creator
    if ((inv as any).createdBy) {
      this.notifications.fire({
        tenantId,
        recipientUserId: (inv as any).createdBy,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        body: `${payment.currency} ${(Number(amountCents) / 100).toLocaleString()} received for invoice ${(inv as any).invoiceRef ?? invoiceId.slice(0, 8)}.`,
        link: '/finance',
      }).catch(() => undefined);
    }

    return { ...payment, amountCents: Number(payment.amountCents) };
  }


  async findPayments(tenantId: string, query: any) {
    const { page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({ where: { tenantId }, skip, take: +limit, orderBy: { createdAt: 'desc' }, include: { invoice: { select: { invoiceRef: true, issuedToName: true } } } }),
      this.prisma.payment.count({ where: { tenantId } }),
    ]);
    return {
      items: items.map(p => ({ ...p, amountCents: Number(p.amountCents) })),
      total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit),
    };
  }

  async getSummary(tenantId: string) {
    const [paidAgg, paidCount, outstandingAgg, outstandingCount, draftAgg, draftCount] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'PAID' as any }, _sum: { paidCents: true } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'PAID' as any } }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } }, _sum: { totalCents: true } }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] as any } } }),
      this.prisma.invoice.aggregate({ where: { tenantId, status: 'DRAFT' as any }, _sum: { totalCents: true } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'DRAFT' as any } }),
    ]);
    return {
      paid: { amountCents: Number(paidAgg._sum.paidCents ?? 0), count: paidCount },
      outstanding: { amountCents: Number(outstandingAgg._sum.totalCents ?? 0), count: outstandingCount },
      draft: { amountCents: Number(draftAgg._sum.totalCents ?? 0), count: draftCount },
    };
  }

  // ── Invoice edit / status / delete ─────────────────────────────────────
  async updateInvoice(tenantId: string, id: string, dto: any) {
    const current = await this.findOne(tenantId, id);
    await this.assertInvoiceParties(tenantId, { bookingId: dto.bookingId, pilgrimId: dto.pilgrimId, vendorId: dto.vendorId });
    const data: any = {};
    if (dto.clientName !== undefined && dto.issuedToName === undefined && dto.counterpartyName === undefined) {
      data.issuedToName = dto.clientName;
    }
    if (dto.issuedToName !== undefined) data.issuedToName = dto.issuedToName;
    if (dto.counterpartyName !== undefined) data.issuedToName = dto.counterpartyName;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.lineItems !== undefined) data.lineItems = dto.lineItems;
    if (dto.bookingId !== undefined) data.bookingId = dto.bookingId || null;
    if (dto.pilgrimId !== undefined) data.pilgrimId = dto.pilgrimId || null;
    if (dto.vendorId !== undefined) data.vendorId = dto.vendorId || null;
    if (dto.issuedToAddress !== undefined) data.issuedToAddress = dto.issuedToAddress;
    const dueAt = dto.dueAt !== undefined ? dto.dueAt : dto.dueDate;
    if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
    if (dto.status !== undefined && dto.status !== null && dto.status !== current.status) {
      this.assertInvoiceTransition(current, String(dto.status));
      data.status = dto.status;
      if (dto.status === 'ISSUED' && !current.issuedAt) data.issuedAt = new Date();
    }
    if (dto.subtotal !== undefined) data.subtotalCents = BigInt(Math.round(Number(dto.subtotal) * 100));
    if (dto.subtotalCents !== undefined) data.subtotalCents = BigInt(Math.round(Number(dto.subtotalCents)));
    if (dto.tax !== undefined) data.taxCents = BigInt(Math.round(Number(dto.tax) * 100));
    if (dto.taxCents !== undefined) data.taxCents = BigInt(Math.round(Number(dto.taxCents)));
    if (dto.discountCents !== undefined) data.discountCents = BigInt(Math.round(Number(dto.discountCents)));
    if (data.subtotalCents !== undefined || data.taxCents !== undefined || data.discountCents !== undefined) {
      if (['PAID', 'CANCELLED', 'VOID'].includes(current.status)) {
        throw new BadRequestException(`Amounts of a ${current.status} invoice cannot be changed`);
      }
      const sub = BigInt(data.subtotalCents ?? current.subtotalCents);
      const tax = BigInt(data.taxCents ?? current.taxCents);
      const discount = BigInt(data.discountCents ?? current.discountCents ?? 0);
      if (sub < BigInt(0) || tax < BigInt(0) || discount < BigInt(0)) {
        throw new BadRequestException('Amounts must not be negative');
      }
      if (discount > sub + tax) throw new BadRequestException('Discount must not exceed the invoice subtotal plus tax');
      const total = sub + tax - discount;
      if (total < BigInt(current.paidCents ?? 0)) {
        throw new BadRequestException('Invoice total cannot be lower than the amount already paid');
      }
      data.totalCents = total;
    }
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data }));
  }

  /**
   * Generic-update status changes: only valid lifecycle moves. PAID and
   * PARTIALLY_PAID are derived from recorded payments, never set by hand here.
   */
  private assertInvoiceTransition(current: any, next: string) {
    if (next === 'PAID' || next === 'PARTIALLY_PAID') {
      throw new BadRequestException('Invoice payment status is derived from recorded payments — record a payment instead');
    }
    const allowed = INVOICE_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Invoice cannot move from ${current.status} to ${next}`);
    }
    if (next === 'DRAFT' && BigInt(current.paidCents ?? 0) > BigInt(0)) {
      throw new BadRequestException('An invoice with recorded payments cannot return to DRAFT');
    }
  }

  /** Apply a paid-amount delta to an invoice and re-derive its payment status. */
  private async adjustInvoicePaid(invoiceId: string, tenantId: string, deltaCents: bigint) {
    const inv = await this.prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!inv) return;
    let newPaid = BigInt(inv.paidCents) + deltaCents;
    if (newPaid < BigInt(0)) newPaid = BigInt(0);
    const total = BigInt(inv.totalCents);
    const terminal = ['CANCELLED', 'VOID'].includes(inv.status);
    const status = terminal
      ? inv.status
      : newPaid <= BigInt(0)
        ? (inv.status === 'DRAFT' ? 'DRAFT' : 'ISSUED')
        : newPaid >= total ? 'PAID' : 'PARTIALLY_PAID';
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidCents: newPaid,
        status: status as any,
        paidAt: status === 'PAID' ? (inv.paidAt ?? new Date()) : null,
      },
    });
  }

  async setInvoiceStatus(tenantId: string, id: string, status: string) {
    const current = await this.findOne(tenantId, id);
    if (status === current.status) return current;
    // Same lifecycle rules as PUT /finance/invoices/:id — PAID / PARTIALLY_PAID are derived from payments.
    this.assertInvoiceTransition(current, status);
    const patch: any = { status };
    if (status === 'ISSUED' && !current.issuedAt) patch.issuedAt = new Date();
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: patch }));
  }

  async deleteInvoice(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: { status: 'CANCELLED' as any } }));
  }

  // ── Payment management ─────────────────────────────────────────────────
  async findOnePayment(tenantId: string, id: string) {
    const p = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: { invoice: { select: { invoiceRef: true, issuedToName: true, totalCents: true } } },
    });
    if (!p) throw new NotFoundException('Payment not found');
    return { ...p, amountCents: Number(p.amountCents), refundedCents: Number(p.refundedCents) };
  }

  /**
   * Manual payment bookkeeping. Provider-driven payments (sandbox/stripe) are
   * read-only here; amounts change only while a manual payment is unsettled;
   * status moves keep the linked invoice's paid total consistent.
   */
  async updatePayment(tenantId: string, id: string, dto: any) {
    const p0 = await this.findOnePayment(tenantId, id);
    const isProvider = PROVIDER_GATEWAYS.has(String(p0.gateway).toLowerCase());
    const touchesMoney = dto.status !== undefined || dto.amount !== undefined || dto.amountCents !== undefined
      || dto.gateway !== undefined || dto.method !== undefined;
    if (isProvider && touchesMoney) {
      throw new BadRequestException('Gateway payments are managed by the payment provider — use /payments endpoints');
    }
    const newGateway = dto.method ?? dto.gateway;
    if (newGateway !== undefined && PROVIDER_GATEWAYS.has(String(newGateway).toLowerCase())) {
      throw new BadRequestException('A manual payment cannot be re-labelled as a provider payment');
    }

    const data: any = {};
    if (dto.gateway !== undefined) data.gateway = dto.gateway;
    if (dto.method !== undefined) data.gateway = dto.method;
    if (dto.gatewayRef !== undefined) data.gatewayRef = dto.gatewayRef;
    if (dto.referenceNumber !== undefined) data.gatewayRef = dto.referenceNumber;
    if (dto.paidAt !== undefined) data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;

    let amount = BigInt(p0.amountCents);
    if (dto.amount !== undefined || dto.amountCents !== undefined) {
      if (SETTLED_PAYMENT_STATUSES.has(p0.status)) {
        throw new BadRequestException(`The amount of a ${p0.status} payment cannot be changed`);
      }
      amount = dto.amountCents !== undefined
        ? BigInt(Math.round(Number(dto.amountCents)))
        : BigInt(Math.round(Number(dto.amount) * 100));
      if (amount <= BigInt(0)) throw new BadRequestException('Payment amount must be greater than zero');
      data.amountCents = amount;
    }

    const prevStatus = p0.status as string;
    const nextStatus = dto.status !== undefined && dto.status !== null ? String(dto.status) : prevStatus;
    let invoiceDelta = BigInt(0);
    if (nextStatus !== prevStatus) {
      if (nextStatus === 'REFUNDED' || nextStatus === 'PARTIALLY_REFUNDED') {
        throw new BadRequestException('Use POST /finance/payments/:id/refund to refund a payment');
      }
      if (prevStatus === 'REFUNDED' || prevStatus === 'PARTIALLY_REFUNDED') {
        throw new BadRequestException(`A ${prevStatus} payment cannot change status`);
      }
      if (nextStatus === 'COMPLETED') {
        // Settling a payment: it must fit the invoice's outstanding balance.
        if (p0.invoiceId) {
          const inv = await this.prisma.invoice.findFirst({ where: { id: p0.invoiceId, tenantId } });
          if (inv) {
            const outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents);
            if (amount > outstanding) {
              throw new BadRequestException('Payment amount exceeds the invoice outstanding balance');
            }
          }
        }
        invoiceDelta = amount;
        if (data.paidAt === undefined && !p0.paidAt) data.paidAt = new Date();
      } else if (prevStatus === 'COMPLETED') {
        // Un-settling a manual payment removes it from the invoice paid total.
        invoiceDelta = -(amount - BigInt(p0.refundedCents ?? 0));
      }
      data.status = nextStatus;
      if (nextStatus === 'FAILED') data.failedAt = new Date();
    }

    const p = await this.prisma.payment.update({ where: { id }, data });
    if (p0.invoiceId && invoiceDelta !== BigInt(0)) {
      await this.adjustInvoicePaid(p0.invoiceId, tenantId, invoiceDelta);
    }
    return { ...p, amountCents: Number(p.amountCents), refundedCents: Number(p.refundedCents) };
  }

  /**
   * Refund a manual (non-provider) payment. Capped at the refundable balance
   * (amount − already refunded); partial refunds accumulate.
   */
  async refundPayment(tenantId: string, id: string, amount?: number) {
    const p = await this.findOnePayment(tenantId, id);
    if (PROVIDER_GATEWAYS.has(String(p.gateway).toLowerCase())) {
      throw new BadRequestException('Gateway payments must be refunded through POST /payments/:id/refund');
    }
    if (p.status !== 'COMPLETED' && p.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('Only a completed payment can be refunded');
    }
    const already = BigInt(p.refundedCents ?? 0);
    const remaining = BigInt(p.amountCents) - already;
    if (remaining <= BigInt(0)) throw new BadRequestException('Payment is already fully refunded');
    const refundCents = amount != null ? BigInt(Math.round(Number(amount) * 100)) : remaining;
    if (refundCents <= BigInt(0)) throw new BadRequestException('Refund amount must be greater than zero');
    if (refundCents > remaining) {
      throw new BadRequestException(
        `Refund exceeds the refundable balance (${Number(remaining) / 100} ${p.currency})`,
      );
    }
    const totalRefunded = already + refundCents;
    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: (totalRefunded >= BigInt(p.amountCents) ? 'REFUNDED' : 'PARTIALLY_REFUNDED') as any,
        refundedCents: totalRefunded,
        refundedAt: new Date(),
      },
    });
    // Roll back the invoice paid amount + status by the refunded delta only
    if (p.invoiceId) await this.adjustInvoicePaid(p.invoiceId, tenantId, -refundCents);
    // Notification engine: refund event for the invoice creator
    if (p.invoiceId) {
      const inv2 = await this.prisma.invoice.findFirst({ where: { id: p.invoiceId, tenantId } });
      if (inv2 && (inv2 as any).createdBy) {
        this.notifications.fire({
          tenantId,
          recipientUserId: (inv2 as any).createdBy,
          type: 'PAYMENT_RECEIVED',
          title: 'Payment refunded',
          body: `${updated.currency} ${(Number(refundCents) / 100).toLocaleString()} refunded on invoice ${(inv2 as any).invoiceRef ?? p.invoiceId.slice(0, 8)}.`,
          link: '/finance-payments',
        }).catch(() => undefined);
      }
    }
    return { ...updated, amountCents: Number(updated.amountCents), refundedCents: Number(updated.refundedCents) };
  }

  // ── Finance Manager dashboard stats ────────────────────────────────────
  async getDashboardStats(tenantId: string) {
    const summary = await this.getSummary(tenantId);
    const [partialCount, overdueCount, sentCount, recentPayments, financedBookings, plans] = await Promise.all([
      this.prisma.invoice.count({ where: { tenantId, status: 'PARTIALLY_PAID' as any } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'OVERDUE' as any } }),
      this.prisma.invoice.count({ where: { tenantId, status: { in: ['ISSUED', 'SENT'] as any } } }),
      this.prisma.payment.findMany({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 6,
        include: { invoice: { select: { invoiceRef: true, issuedToName: true } } },
      }),
      this.prisma.invoice.count({ where: { tenantId, bookingId: { not: null } } }),
      this.prisma.budgetPlan.findMany({ where: { tenantId }, select: { status: true, commissionCents: true } }),
    ]);
    const activeBudgetPlans = plans.filter((p) => ['PROPOSED', 'ACCEPTED'].includes(p.status)).length;
    const commissionEarned = plans
      .filter((p) => ['ACCEPTED', 'COMPLETED'].includes(p.status))
      .reduce((s, p) => s + Number(p.commissionCents), 0);
    return {
      ...summary,
      partialCount,
      overdueCount,
      sentCount,
      financedBookings,
      budgetPlans: { total: plans.length, active: activeBudgetPlans },
      commissionEarnedCents: commissionEarned,
      currency: 'SAR',
      recentTransactions: recentPayments.map((p: any) => ({
        id: p.id,
        amountCents: Number(p.amountCents),
        gateway: p.gateway,
        status: p.status,
        invoiceRef: p.invoice?.invoiceRef,
        counterparty: p.invoice?.issuedToName,
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
    };
  }

  async findBudgetPlans(tenantId: string, query: any = {}) {
    const { status, page = 1, limit = 50 } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    const skip = (+page - 1) * +limit;
    const [items, total] = await Promise.all([
      this.prisma.budgetPlan.findMany({ where, skip, take: +limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.budgetPlan.count({ where }),
    ]);
    return { items: items.map((p) => this.normalizePlan(p)), total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findBudgetPlan(tenantId: string, id: string) {
    const p = await this.prisma.budgetPlan.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Budget plan not found');
    return this.normalizePlan(p);
  }

  private toCents(v: any): bigint {
    if (v == null) return BigInt(0);
    return BigInt(Math.round(Number(v) * 100));
  }

  async createBudgetPlan(tenantId: string, dto: any, createdBy?: string) {
    const planRef = `BP-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const hotel = this.toCents(dto.hotelBudget);
    const transport = this.toCents(dto.transportBudget);
    const visa = this.toCents(dto.visaBudget);
    const pkg = this.toCents(dto.packageBudget);
    const other = this.toCents(dto.otherBudget);
    const total = dto.totalBudget != null ? this.toCents(dto.totalBudget) : hotel + transport + visa + pkg + other;
    const commissionRate = dto.commissionRate != null ? Number(dto.commissionRate) : null;
    const commissionCents = dto.commission != null
      ? this.toCents(dto.commission)
      : commissionRate != null
        ? BigInt(Math.round(Number(total) * (commissionRate / 100)))
        : BigInt(0);
    const plan = await this.prisma.budgetPlan.create({
      data: {
        tenantId,
        planRef,
        clientUserId: dto.clientUserId && String(dto.clientUserId).length === 36 ? dto.clientUserId : null,
        clientName: dto.clientName ?? 'Client',
        clientType: (dto.clientType ?? 'TRAVELER').toUpperCase(),
        requestId: dto.requestId && String(dto.requestId).length === 36 ? dto.requestId : null,
        destination: dto.destination,
        dateFrom: dto.dateFrom ? new Date(dto.dateFrom) : null,
        dateTo: dto.dateTo ? new Date(dto.dateTo) : null,
        travelers: dto.travelers != null ? Number(dto.travelers) : 1,
        currency: dto.currency ?? 'SAR',
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
        status: (dto.status ?? 'DRAFT').toUpperCase(),
        notes: dto.notes,
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    return this.normalizePlan(plan);
  }

  async updateBudgetPlan(tenantId: string, id: string, dto: any) {
    await this.findBudgetPlan(tenantId, id);
    const data: any = {};
    for (const k of ['clientName', 'destination', 'notes', 'currency', 'suggestedOptions', 'finalPlan']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.clientType !== undefined) data.clientType = String(dto.clientType).toUpperCase();
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.travelers !== undefined) data.travelers = Number(dto.travelers);
    if (dto.dateFrom !== undefined) data.dateFrom = dto.dateFrom ? new Date(dto.dateFrom) : null;
    if (dto.dateTo !== undefined) data.dateTo = dto.dateTo ? new Date(dto.dateTo) : null;
    if (dto.hotelBudget !== undefined) data.hotelBudgetCents = this.toCents(dto.hotelBudget);
    if (dto.transportBudget !== undefined) data.transportBudgetCents = this.toCents(dto.transportBudget);
    if (dto.visaBudget !== undefined) data.visaBudgetCents = this.toCents(dto.visaBudget);
    if (dto.packageBudget !== undefined) data.packageBudgetCents = this.toCents(dto.packageBudget);
    if (dto.otherBudget !== undefined) data.otherBudgetCents = this.toCents(dto.otherBudget);
    if (dto.totalBudget !== undefined) data.totalBudgetCents = this.toCents(dto.totalBudget);
    if (dto.commissionRate !== undefined) data.commissionRate = dto.commissionRate != null ? Number(dto.commissionRate) : null;
    if (dto.commission !== undefined) data.commissionCents = this.toCents(dto.commission);
    const plan = await this.prisma.budgetPlan.update({ where: { id }, data });
    return this.normalizePlan(plan);
  }

  async deleteBudgetPlan(tenantId: string, id: string) {
    await this.findBudgetPlan(tenantId, id);
    return this.normalizePlan(await this.prisma.budgetPlan.update({ where: { id }, data: { status: 'CANCELLED' } }));
  }
}
