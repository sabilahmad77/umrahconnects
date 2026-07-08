import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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

  async createInvoice(tenantId: string, dto: any, createdBy?: string) {
    const invoiceRef = `INV-${new Date().getFullYear()}-${Math.random().toString().slice(2, 7)}`;
    const subtotalCents = BigInt(Math.round((dto.subtotal ?? dto.subtotalCents ?? 0) * (dto.subtotal ? 100 : 1)));
    const taxCents = BigInt(Math.round((dto.tax ?? dto.taxCents ?? 0) * (dto.tax ? 100 : 1)));
    const totalCents = subtotalCents + taxCents;

    return this.normalizeInvoice(await this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceRef,
        type: dto.type ?? 'CUSTOMER',
        bookingId: dto.bookingId,
        pilgrimId: dto.pilgrimId,
        vendorId: dto.vendorId,
        issuedToName: dto.issuedToName ?? dto.counterpartyName ?? 'Unknown',
        issuedToAddress: dto.issuedToAddress ?? null,
        subtotalCents,
        taxCents,
        discountCents: BigInt(Math.round((dto.discountCents ?? 0))),
        totalCents,
        currency: dto.currency ?? 'SAR',
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : new Date(),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        lineItems: dto.lineItems ?? [],
        notes: dto.notes,
        createdBy,
      },
    }));
  }

  async issueInvoice(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: { status: 'ISSUED', issuedAt: new Date() } }));
  }

  async voidInvoice(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data: { status: 'VOID' } }));
  }

  async recordPayment(tenantId: string, invoiceId: string, dto: any) {
    const inv = await this.findOne(tenantId, invoiceId);
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
        currency: dto.currency ?? inv.currency ?? 'SAR',
        gateway: dto.gateway ?? dto.method ?? 'cash',
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
    await this.findOne(tenantId, id);
    const data: any = {};
    if (dto.issuedToName !== undefined) data.issuedToName = dto.issuedToName;
    if (dto.counterpartyName !== undefined) data.issuedToName = dto.counterpartyName;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.lineItems !== undefined) data.lineItems = dto.lineItems;
    if (dto.bookingId !== undefined) data.bookingId = dto.bookingId || null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.subtotal !== undefined) data.subtotalCents = BigInt(Math.round(Number(dto.subtotal) * 100));
    if (dto.subtotalCents !== undefined) data.subtotalCents = BigInt(Math.round(Number(dto.subtotalCents)));
    if (dto.tax !== undefined) data.taxCents = BigInt(Math.round(Number(dto.tax) * 100));
    if (dto.taxCents !== undefined) data.taxCents = BigInt(Math.round(Number(dto.taxCents)));
    if (data.subtotalCents !== undefined || data.taxCents !== undefined) {
      const current = await this.prisma.invoice.findUnique({ where: { id } });
      const sub = data.subtotalCents ?? current!.subtotalCents;
      const tax = data.taxCents ?? current!.taxCents;
      data.totalCents = BigInt(sub) + BigInt(tax);
    }
    return this.normalizeInvoice(await this.prisma.invoice.update({ where: { id }, data }));
  }

  async setInvoiceStatus(tenantId: string, id: string, status: string) {
    await this.findOne(tenantId, id);
    const patch: any = { status };
    if (status === 'PAID') patch.paidAt = new Date();
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

  async updatePayment(tenantId: string, id: string, dto: any) {
    await this.findOnePayment(tenantId, id);
    const data: any = {};
    if (dto.gateway !== undefined) data.gateway = dto.gateway;
    if (dto.method !== undefined) data.gateway = dto.method;
    if (dto.gatewayRef !== undefined) data.gatewayRef = dto.gatewayRef;
    if (dto.referenceNumber !== undefined) data.gatewayRef = dto.referenceNumber;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.amount !== undefined) data.amountCents = BigInt(Math.round(Number(dto.amount) * 100));
    if (dto.amountCents !== undefined) data.amountCents = BigInt(Math.round(Number(dto.amountCents)));
    if (dto.paidAt !== undefined) data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    const p = await this.prisma.payment.update({ where: { id }, data });
    return { ...p, amountCents: Number(p.amountCents), refundedCents: Number(p.refundedCents) };
  }

  async refundPayment(tenantId: string, id: string, amount?: number) {
    const p = await this.findOnePayment(tenantId, id);
    const refundCents = amount != null ? BigInt(Math.round(Number(amount) * 100)) : BigInt(p.amountCents);
    const updated = await this.prisma.payment.update({
      where: { id },
      data: { status: 'REFUNDED' as any, refundedCents: refundCents, refundedAt: new Date() },
    });
    // Roll back the invoice paid amount + status
    if (p.invoiceId) {
      const inv = await this.prisma.invoice.findUnique({ where: { id: p.invoiceId } });
      if (inv) {
        const newPaid = BigInt(inv.paidCents) - refundCents;
        await this.prisma.invoice.update({
          where: { id: p.invoiceId },
          data: {
            paidCents: newPaid < BigInt(0) ? BigInt(0) : newPaid,
            status: newPaid <= BigInt(0) ? 'ISSUED' : 'PARTIALLY_PAID',
          },
        });
      }
    }
    // Notification engine: refund event for the invoice creator
    if (p.invoiceId) {
      const inv2 = await this.prisma.invoice.findUnique({ where: { id: p.invoiceId } });
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
