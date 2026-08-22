import {
  Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PaymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentProvider } from './providers/payment-provider';
import { SandboxProvider } from './providers/sandbox.provider';
import { StripeProvider } from './providers/stripe.provider';

export interface PayActor { sub?: string; email?: string; tenantId?: string }

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
  ) {
    const sandbox = new SandboxProvider(
      this.config.get<string>('SANDBOX_WEBHOOK_SECRET') ?? 'dev-sandbox-webhook-secret',
    );
    this.providers.set(sandbox.name, sandbox);
    const stripe = new StripeProvider({
      secretKey: this.config.get<string>('STRIPE_SECRET_KEY'),
      webhookSecret: this.config.get<string>('STRIPE_WEBHOOK_SECRET'),
    });
    this.providers.set(stripe.name, stripe);
  }

  get defaultProviderName() {
    return this.config.get<string>('PAYMENT_PROVIDER') ?? 'sandbox';
  }

  provider(name?: string): PaymentProvider {
    const key = (name ?? this.defaultProviderName).toLowerCase();
    const p = this.providers.get(key);
    if (!p) throw new BadRequestException(`Unknown payment provider "${key}"`);
    return p;
  }

  /** What the UI shows so nobody assumes a live gateway that isn't there. */
  providerStatus() {
    return {
      active: this.defaultProviderName,
      providers: [...this.providers.values()].map((p) => ({
        name: p.name,
        configured: p.isConfigured(),
        missing: p.missingConfig(),
        sandbox: p.name === 'sandbox',
      })),
    };
  }

  private requireConfigured(p: PaymentProvider) {
    if (!p.isConfigured()) {
      throw new ServiceUnavailableException(
        `Payment provider "${p.name}" is not configured. Missing: ${p.missingConfig().join(', ')}`,
      );
    }
  }

  // ── ledger ─────────────────────────────────────────────────────────────

  private async record(
    tenantId: string, paymentId: string, provider: string, type: string,
    fields: Partial<{ amountCents: bigint; currency: string; providerRef: string; status: string; message: string; payload: unknown; actorId: string }> = {},
  ) {
    return this.prisma.paymentTransaction.create({
      data: {
        tenantId, paymentId, provider, type,
        amountCents: fields.amountCents ?? BigInt(0),
        currency: fields.currency ?? 'SAR',
        providerRef: fields.providerRef,
        status: fields.status,
        message: fields.message?.slice(0, 400),
        payload: (fields.payload ?? {}) as Prisma.InputJsonValue,
        actorId: fields.actorId,
      },
    });
  }

  private serialize<T extends Record<string, any>>(row: T): T {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'bigint' ? Number(v) : Array.isArray(v) ? v.map((x) => this.serialize(x)) : v;
    }
    return out as T;
  }

  private async mustFindPayment(tenantId: string, id: string) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    if (!id) throw new BadRequestException('Payment id is required');
    const p = await this.prisma.payment.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  // ── intents ────────────────────────────────────────────────────────────

  /**
   * Create a payment intent. `idempotencyKey` is honoured: replaying the same
   * key returns the original payment instead of charging twice.
   */
  async createIntent(
    tenantId: string,
    dto: {
      amount?: number; amountCents?: number; currency?: string; invoiceId?: string;
      bookingId?: string; pilgrimId?: string; provider?: string; scenario?: string;
      idempotencyKey?: string;
    },
    actor?: PayActor,
  ) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const cents = dto.amountCents != null
      ? BigInt(Math.round(Number(dto.amountCents)))
      : dto.amount != null ? BigInt(Math.round(Number(dto.amount) * 100)) : null;
    if (cents === null || !Number.isFinite(Number(cents))) {
      throw new BadRequestException('An amount is required');
    }
    if (cents <= BigInt(0)) throw new BadRequestException('Amount must be greater than zero');

    const currency = (dto.currency ?? 'SAR').toUpperCase();
    if (currency.length !== 3) throw new BadRequestException('Currency must be a 3-letter code');

    const provider = this.provider(dto.provider);
    this.requireConfigured(provider);

    if (dto.invoiceId) {
      const inv = await this.prisma.invoice.findFirst({ where: { id: dto.invoiceId, tenantId } });
      if (!inv) throw new NotFoundException('Invoice not found');
      const outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents);
      if (cents > outstanding) {
        throw new BadRequestException(
          `Amount exceeds the outstanding balance (${Number(outstanding) / 100} ${inv.currency})`,
        );
      }
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || `intent_${randomUUID()}`;
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.tenantId !== tenantId) throw new BadRequestException('Idempotency key already used');
      return { ...this.serialize(existing), idempotentReplay: true };
    }

    const intent = await provider.createIntent({
      amountCents: cents, currency, reference: idempotencyKey, scenario: dto.scenario,
    });

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        bookingId: dto.bookingId,
        pilgrimId: dto.pilgrimId,
        amountCents: cents,
        currency,
        gateway: provider.name,
        gatewayRef: intent.providerRef,
        gatewayStatus: intent.status,
        gatewayResponse: intent.raw as Prisma.InputJsonValue,
        idempotencyKey,
        status: intent.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.PENDING,
        failedAt: intent.status === 'FAILED' ? new Date() : undefined,
        failureReason: intent.status === 'FAILED' ? String((intent.raw as any)?.reason ?? 'declined') : undefined,
      },
    });

    await this.record(tenantId, payment.id, provider.name, 'INTENT_CREATED', {
      amountCents: cents, currency, providerRef: intent.providerRef,
      status: intent.status, actorId: actor?.sub, payload: intent.raw,
    });
    await this.audit.log({
      tenantId, actorId: actor?.sub, actorEmail: actor?.email, action: 'PAYMENT_INITIATE',
      namespace: 'finance', resource: 'payment', resourceId: payment.id,
      afterState: { status: payment.status, gateway: provider.name },
      metadata: { amountCents: Number(cents), currency, idempotencyKey },
    });

    return { ...this.serialize(payment), clientSecret: intent.clientSecret, idempotentReplay: false };
  }

  /** Confirm (capture) an intent. Sandbox does this inline; real gateways
   *  usually finish via webhook, which this same code path also serves. */
  async confirmIntent(tenantId: string, id: string, scenario?: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    if (payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Payment is already captured');
    }
    if (payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Payment has been refunded');
    }
    if (payment.status === PaymentStatus.FAILED) {
      throw new BadRequestException('Payment already failed — create a new intent');
    }

    const provider = this.provider(payment.gateway);
    this.requireConfigured(provider);
    const res = await provider.confirm(payment.gatewayRef ?? '', scenario);

    if (res.status === 'FAILED') {
      const failed = await this.prisma.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.FAILED, failedAt: new Date(),
          failureReason: res.failureReason ?? 'capture_failed',
          gatewayStatus: res.status, gatewayResponse: res.raw as Prisma.InputJsonValue,
        },
      });
      await this.record(tenantId, id, provider.name, 'FAILED', {
        amountCents: BigInt(payment.amountCents), currency: payment.currency,
        providerRef: res.providerRef, status: res.status,
        message: res.failureReason, actorId: actor?.sub, payload: res.raw,
      });
      await this.audit.log({
        tenantId, actorId: actor?.sub, actorEmail: actor?.email, action: 'PAYMENT_FAIL',
        namespace: 'finance', resource: 'payment', resourceId: id,
        afterState: { status: failed.status }, metadata: { reason: res.failureReason },
      });
      return this.serialize(failed);
    }

    return this.settle(tenantId, id, provider.name, res.providerRef, res.raw, actor);
  }

  /** Mark captured and reconcile the invoice. Shared by confirm and webhook. */
  private async settle(
    tenantId: string, id: string, providerName: string,
    providerRef: string, raw: Record<string, unknown>, actor?: PayActor,
  ) {
    const payment = await this.mustFindPayment(tenantId, id);
    if (payment.status === PaymentStatus.COMPLETED) return this.serialize(payment);

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
        gatewayStatus: 'CAPTURED',
        gatewayRef: providerRef || payment.gatewayRef,
        gatewayResponse: raw as Prisma.InputJsonValue,
        failedAt: null,
        failureReason: null,
      },
    });

    if (payment.invoiceId) await this.reconcileInvoice(payment.invoiceId);

    await this.record(tenantId, id, providerName, 'CAPTURED', {
      amountCents: BigInt(payment.amountCents), currency: payment.currency,
      providerRef, status: 'CAPTURED', actorId: actor?.sub, payload: raw,
    });
    await this.audit.log({
      tenantId, actorId: actor?.sub, actorEmail: actor?.email, action: 'PAYMENT_COMPLETE',
      namespace: 'finance', resource: 'payment', resourceId: id,
      afterState: { status: updated.status }, metadata: { providerRef },
    });
    return this.serialize(updated);
  }

  /** Recompute an invoice's paid total from its captured payments only. */
  private async reconcileInvoice(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) return;
    const agg = await this.prisma.payment.aggregate({
      where: { invoiceId, status: { in: [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED] } },
      _sum: { amountCents: true, refundedCents: true },
    });
    const paid = BigInt(agg._sum.amountCents ?? 0) - BigInt(agg._sum.refundedCents ?? 0);
    const total = BigInt(inv.totalCents);
    const status = paid <= BigInt(0)
      ? (inv.status === 'DRAFT' ? 'DRAFT' : 'ISSUED')
      : paid >= total ? 'PAID' : 'PARTIALLY_PAID';
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidCents: paid < BigInt(0) ? BigInt(0) : paid,
        status: status as any,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });
  }

  // ── refunds ────────────────────────────────────────────────────────────

  async refund(tenantId: string, id: string, amount?: number, reason?: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    if (payment.status !== PaymentStatus.COMPLETED && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Only a captured payment can be refunded');
    }
    const already = BigInt(payment.refundedCents);
    const remaining = BigInt(payment.amountCents) - already;
    if (remaining <= BigInt(0)) throw new BadRequestException('Payment is already fully refunded');

    const requested = amount != null ? BigInt(Math.round(Number(amount) * 100)) : remaining;
    if (requested <= BigInt(0)) throw new BadRequestException('Refund amount must be greater than zero');
    if (requested > remaining) {
      throw new BadRequestException(
        `Refund exceeds the refundable balance (${Number(remaining) / 100} ${payment.currency})`,
      );
    }

    const provider = this.provider(payment.gateway);
    this.requireConfigured(provider);
    const res = await provider.refund(payment.gatewayRef ?? '', requested);

    const total = already + res.refundedCents;
    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        refundedCents: total,
        refundedAt: new Date(),
        // Partial refunds must not masquerade as a full refund.
        status: total >= BigInt(payment.amountCents)
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED,
      },
    });

    if (payment.invoiceId) await this.reconcileInvoice(payment.invoiceId);

    await this.record(tenantId, id, provider.name, 'REFUNDED', {
      amountCents: res.refundedCents, currency: payment.currency,
      providerRef: res.providerRef, status: updated.status,
      message: reason, actorId: actor?.sub, payload: res.raw,
    });
    await this.audit.log({
      tenantId, actorId: actor?.sub, actorEmail: actor?.email, action: 'UPDATE',
      namespace: 'finance', resource: 'payment', resourceId: id,
      beforeState: { refundedCents: Number(already) },
      afterState: { refundedCents: Number(total), status: updated.status },
      metadata: { reason },
    });
    return this.serialize(updated);
  }

  // ── webhooks ───────────────────────────────────────────────────────────

  /**
   * Verify the signature, then process at most once. A replayed delivery is
   * recognised by (provider, eventId) and acknowledged without re-applying,
   * because gateways retry and a double-capture is unacceptable.
   */
  async handleWebhook(providerName: string, rawBody: string, signature?: string) {
    const provider = this.provider(providerName);
    const verified = provider.verifyWebhook(rawBody, signature);
    if (!verified.valid) {
      throw new BadRequestException(`Webhook rejected: ${verified.reason ?? 'invalid signature'}`);
    }

    const prior = await this.prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: provider.name, eventId: verified.eventId } },
    });
    if (prior) {
      return { received: true, duplicate: true, eventId: verified.eventId, result: prior.result };
    }

    const payment = verified.providerRef
      ? await this.prisma.payment.findFirst({ where: { gatewayRef: verified.providerRef } })
      : null;

    const event = await this.prisma.paymentWebhookEvent.create({
      data: {
        provider: provider.name,
        eventId: verified.eventId,
        type: verified.type,
        paymentId: payment?.id,
        tenantId: payment?.tenantId,
        signature: signature?.slice(0, 400),
        payload: verified.raw as Prisma.InputJsonValue,
      },
    });

    let result = 'ignored';
    if (payment) {
      await this.record(payment.tenantId, payment.id, provider.name, 'WEBHOOK_RECEIVED', {
        providerRef: verified.providerRef, status: verified.type,
        message: `webhook ${verified.type}`, payload: verified.raw,
      });
      if (verified.type === 'payment.captured' || verified.type === 'payment.succeeded') {
        await this.settle(payment.tenantId, payment.id, provider.name, verified.providerRef ?? '', verified.raw);
        result = 'captured';
      } else if (verified.type === 'payment.failed') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.FAILED, failedAt: new Date(),
            failureReason: String((verified.raw as any)?.data?.reason ?? 'gateway reported failure'),
          },
        });
        result = 'failed';
      }
    } else {
      result = 'no matching payment';
    }

    await this.prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), result },
    });
    return { received: true, duplicate: false, eventId: verified.eventId, result };
  }

  // ── reads ──────────────────────────────────────────────────────────────

  async transactions(tenantId: string, paymentId: string) {
    await this.mustFindPayment(tenantId, paymentId);
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { tenantId, paymentId }, orderBy: { createdAt: 'asc' },
    });
    return rows.map((r: Record<string, any>) => this.serialize(r));
  }

  async findOne(tenantId: string, id: string) {
    const payment = await this.mustFindPayment(tenantId, id);
    const transactions = await this.transactions(tenantId, id);
    return { ...this.serialize(payment), transactions };
  }
}
