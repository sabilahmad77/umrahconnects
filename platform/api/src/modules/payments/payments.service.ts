import {
  Injectable, Logger, NotFoundException, BadRequestException, ServiceUnavailableException, ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PaymentStatus } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentProvider, WebhookVerification } from './providers/payment-provider';
import { SandboxProvider } from './providers/sandbox.provider';
import { StripeProvider } from './providers/stripe.provider';
import { requireId } from '../../common/tenant-scope';

export interface PayActor { sub?: string; email?: string | null; tenantId?: string }

type Tx = Prisma.TransactionClient;

const SETTLED: PaymentStatus[] = [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();
  readonly stripe: StripeProvider;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
  ) {
    // The sandbox gateway never exists in production: it settles without moving money.
    if (!this.isProduction && this.config.get<string>('PAYMENT_SANDBOX_ENABLED', 'true') !== 'false') {
      const secret = this.config.get<string>('SANDBOX_WEBHOOK_SECRET') ?? randomBytes(32).toString('hex');
      const sandbox = new SandboxProvider(secret);
      this.providers.set(sandbox.name, sandbox);
    }
    this.stripe = new StripeProvider({
      secretKey: this.config.get<string>('STRIPE_SECRET_KEY'),
      webhookSecret: this.config.get<string>('STRIPE_WEBHOOK_SECRET'),
      publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY'),
    });
    this.providers.set(this.stripe.name, this.stripe);
  }

  private get isProduction() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  get defaultProviderName(): string {
    return (this.config.get<string>('PAYMENT_PROVIDER') ?? (this.isProduction ? 'none' : 'sandbox')).toLowerCase();
  }

  /** The active provider. Clients cannot pick a different gateway. */
  activeProvider(requested?: string): PaymentProvider {
    const key = this.defaultProviderName;
    if (requested && requested.toLowerCase() !== key) {
      throw new BadRequestException(`Payment provider "${requested}" is not active`);
    }
    const p = this.providers.get(key);
    if (!p) throw new ServiceUnavailableException('Online payments are not enabled on this deployment');
    this.requireConfigured(p);
    return p;
  }

  /** Provider that processed an existing payment (it may differ from today's active one). */
  private providerFor(name: string): PaymentProvider {
    const p = this.providers.get(name.toLowerCase());
    if (!p) throw new ServiceUnavailableException(`Payment provider "${name}" is not available`);
    this.requireConfigured(p);
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
        ...(p.name === 'stripe'
          ? { publishableKey: this.stripe.publishableKey ?? null, testMode: this.stripe.testMode }
          : {}),
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
    db: Tx | PrismaService, tenantId: string, paymentId: string, provider: string, type: string,
    fields: Partial<{ amountCents: bigint; currency: string; providerRef: string; status: string; message: string; payload: unknown; actorId: string }> = {},
  ) {
    return db.paymentTransaction.create({
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
      if (k === 'gatewayResponse') continue;
      out[k] = typeof v === 'bigint' ? Number(v) : Array.isArray(v) ? v.map((x) => this.serialize(x)) : v;
    }
    return out as T;
  }

  private async mustFindPayment(tenantId: string, id: string) {
    requireId(id, 'Payment');
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const p = await this.prisma.payment.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  // ── intents (organization staff) ───────────────────────────────────────

  /**
   * Create a payment intent against an invoice or a booking of the caller's
   * organization. The amount is determined by the server: the outstanding
   * balance by default, or a smaller partial amount — never more.
   * `idempotencyKey` is honoured: replaying it returns the original payment.
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
    if (!dto.invoiceId && !dto.bookingId) {
      throw new BadRequestException('A payment must reference an invoice or a booking');
    }
    const idempotencyKey = dto.idempotencyKey?.trim() || `intent_${randomUUID()}`;
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.tenantId !== tenantId) throw new ConflictException('Idempotency key already used');
      return { ...this.serialize(existing), idempotentReplay: true };
    }

    let outstanding: bigint;
    let currency: string;
    let bookingId = dto.bookingId;
    let pilgrimId = dto.pilgrimId;
    if (dto.invoiceId) {
      const inv = await this.prisma.invoice.findFirst({ where: { id: requireId(dto.invoiceId, 'Invoice'), tenantId } });
      if (!inv) throw new NotFoundException('Invoice not found');
      if (['DRAFT', 'VOID', 'CANCELLED', 'PAID'].includes(String(inv.status))) {
        throw new BadRequestException(`Invoice is ${inv.status} and cannot take payments`);
      }
      outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents);
      currency = inv.currency;
      bookingId = inv.bookingId ?? undefined;
      pilgrimId = inv.pilgrimId ?? undefined;
    } else {
      const booking = await this.prisma.booking.findFirst({ where: { id: requireId(dto.bookingId, 'Booking'), tenantId } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (String(booking.status) === 'CANCELLED') throw new BadRequestException('Booking is cancelled');
      outstanding = BigInt(booking.totalAmountCents) - BigInt(booking.paidAmountCents);
      currency = booking.currency;
      if (pilgrimId) {
        const p = await this.prisma.pilgrim.findFirst({ where: { id: requireId(pilgrimId, 'Pilgrim'), tenantId }, select: { id: true } });
        if (!p) throw new NotFoundException('Pilgrim not found');
      }
    }
    if (outstanding <= BigInt(0)) throw new BadRequestException('Nothing is outstanding');
    if (dto.currency && dto.currency.toUpperCase() !== currency.toUpperCase()) {
      throw new BadRequestException(`Currency must be ${currency}`);
    }

    const requested = dto.amountCents != null
      ? BigInt(Math.round(Number(dto.amountCents)))
      : dto.amount != null ? BigInt(Math.round(Number(dto.amount) * 100)) : outstanding;
    if (requested <= BigInt(0)) throw new BadRequestException('Amount must be greater than zero');
    if (requested > outstanding) {
      throw new BadRequestException(`Amount exceeds the outstanding balance (${Number(outstanding) / 100} ${currency})`);
    }

    const provider = this.activeProvider(dto.provider);

    const intent = await provider.createIntent({
      amountCents: requested,
      currency,
      reference: idempotencyKey,
      scenario: provider.name === 'sandbox' ? dto.scenario : undefined,
      metadata: { tenantId, invoiceId: dto.invoiceId, bookingId, description: `Umrah Connect payment ${idempotencyKey}` },
    });

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        bookingId,
        pilgrimId,
        amountCents: requested,
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

    await this.record(this.prisma, tenantId, payment.id, provider.name, 'INTENT_CREATED', {
      amountCents: requested, currency, providerRef: intent.providerRef,
      status: intent.status, actorId: actor?.sub, payload: intent.raw,
    });
    await this.audit.log({
      tenantId, actorId: actor?.sub, actorEmail: actor?.email ?? undefined, action: 'PAYMENT_INITIATE',
      namespace: 'finance', resource: 'payment', resourceId: payment.id,
      afterState: { status: payment.status, gateway: provider.name },
      metadata: { amountCents: Number(requested), currency, idempotencyKey },
    });

    return { ...this.serialize(payment), clientSecret: intent.clientSecret, idempotentReplay: false };
  }

  /**
   * Confirm / reconcile an intent. Sandbox captures inline. For Stripe this reads
   * the PaymentIntent server-side and settles only if Stripe says it succeeded.
   */
  async confirmIntent(tenantId: string, id: string, scenario?: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    return this.reconcile(payment, scenario, actor);
  }

  private async reconcile(payment: Prisma.PaymentGetPayload<{}>, scenario?: string, actor?: PayActor) {
    if (payment.status === PaymentStatus.COMPLETED) throw new BadRequestException('Payment is already captured');
    if (payment.status === PaymentStatus.REFUNDED || payment.status === PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Payment has been refunded');
    }
    if (payment.status === PaymentStatus.FAILED) throw new BadRequestException('Payment already failed — create a new intent');

    const provider = this.providerFor(payment.gateway);
    const res = await provider.confirm(payment.gatewayRef ?? '', provider.name === 'sandbox' ? scenario : undefined);

    if (res.status === 'PENDING') {
      const pending = await this.prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayStatus: String((res.raw as any)?.status ?? 'pending'), status: PaymentStatus.PROCESSING },
      });
      return this.serialize(pending);
    }
    if (res.status === 'FAILED') {
      return this.markFailed(payment, provider.name, res.failureReason ?? 'capture_failed', res.raw, actor);
    }
    return this.settle(payment.id, provider.name, res.providerRef, res.raw, { amountCents: res.amountCents, currency: res.currency }, actor);
  }

  private async markFailed(
    payment: Prisma.PaymentGetPayload<{}>, providerName: string, reason: string, raw: Record<string, unknown>, actor?: PayActor,
  ) {
    const failed = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED, failedAt: new Date(), failureReason: reason.slice(0, 200),
        gatewayStatus: 'FAILED', gatewayResponse: raw as Prisma.InputJsonValue,
      },
    });
    await this.record(this.prisma, payment.tenantId, payment.id, providerName, 'FAILED', {
      amountCents: BigInt(payment.amountCents), currency: payment.currency,
      message: reason, actorId: actor?.sub, payload: raw, status: 'FAILED',
    });
    await this.audit.log({
      tenantId: payment.tenantId, actorId: actor?.sub, actorEmail: actor?.email ?? undefined, action: 'PAYMENT_FAIL',
      namespace: 'finance', resource: 'payment', resourceId: payment.id,
      afterState: { status: failed.status }, metadata: { reason },
    });
    return this.serialize(failed);
  }

  /**
   * Mark captured and reconcile everything the payment pays for — in one
   * transaction, and only if the provider-reported amount matches the record.
   */
  private async settle(
    id: string, providerName: string, providerRef: string, raw: Record<string, unknown>,
    reported: { amountCents?: bigint; currency?: string } = {}, actor?: PayActor,
  ) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    if (payment.status === PaymentStatus.COMPLETED) return this.serialize(payment);

    const expected = BigInt(payment.amountCents);
    const mismatch =
      (reported.amountCents !== undefined && reported.amountCents !== expected) ||
      (reported.currency !== undefined && reported.currency.toUpperCase() !== payment.currency.toUpperCase());
    if (mismatch) {
      this.logger.error(`Payment ${id}: provider amount/currency does not match the record — not settled`);
      const held = await this.prisma.payment.update({
        where: { id },
        data: { status: PaymentStatus.DISPUTED, gatewayStatus: 'AMOUNT_MISMATCH', gatewayResponse: raw as Prisma.InputJsonValue },
      });
      await this.record(this.prisma, payment.tenantId, id, providerName, 'AMOUNT_MISMATCH', {
        amountCents: reported.amountCents ?? BigInt(0), currency: reported.currency ?? payment.currency,
        providerRef, status: 'HELD', message: `expected ${expected} ${payment.currency}`, payload: raw,
      });
      return this.serialize(held);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id, status: { notIn: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED] } },
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
      if (claimed.count === 0) return tx.payment.findUniqueOrThrow({ where: { id } });
      await this.reconcileTargets(tx, payment);
      await this.record(tx, payment.tenantId, id, providerName, 'CAPTURED', {
        amountCents: expected, currency: payment.currency, providerRef, status: 'CAPTURED', actorId: actor?.sub, payload: raw,
      });
      return tx.payment.findUniqueOrThrow({ where: { id } });
    });

    await this.audit.log({
      tenantId: payment.tenantId, actorId: actor?.sub, actorEmail: actor?.email ?? undefined, action: 'PAYMENT_COMPLETE',
      namespace: 'finance', resource: 'payment', resourceId: id,
      afterState: { status: updated.status }, metadata: { providerRef },
    });
    return this.serialize(updated);
  }

  /** Recompute paid totals of the invoice / booking / listing booking from settled payments. */
  private async reconcileTargets(tx: Tx, payment: { invoiceId: string | null; bookingId: string | null; listingBookingId: string | null }) {
    const net = async (where: Prisma.PaymentWhereInput) => {
      const agg = await tx.payment.aggregate({
        where: { ...where, status: { in: SETTLED } },
        _sum: { amountCents: true, refundedCents: true },
      });
      const v = BigInt(agg._sum.amountCents ?? 0) - BigInt(agg._sum.refundedCents ?? 0);
      return v < BigInt(0) ? BigInt(0) : v;
    };

    if (payment.invoiceId) {
      const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (inv) {
        const paid = await net({ invoiceId: inv.id });
        const status = paid <= BigInt(0) ? (inv.status === 'DRAFT' ? 'DRAFT' : 'ISSUED') : paid >= BigInt(inv.totalCents) ? 'PAID' : 'PARTIALLY_PAID';
        await tx.invoice.update({
          where: { id: inv.id },
          data: { paidCents: paid, status: status as any, paidAt: status === 'PAID' ? new Date() : null },
        });
      }
    }
    if (payment.bookingId && !payment.invoiceId) {
      const paid = await net({ bookingId: payment.bookingId, invoiceId: null });
      await tx.booking.updateMany({ where: { id: payment.bookingId }, data: { paidAmountCents: paid } });
    }
    if (payment.listingBookingId) {
      const lb = await tx.listingBooking.findUnique({ where: { id: payment.listingBookingId } });
      if (lb) {
        const paid = await net({ listingBookingId: lb.id });
        const total = BigInt(lb.totalAmountCents);
        const paymentStatus = paid <= BigInt(0) ? (lb.paymentStatus === 'UNPAID' ? 'UNPAID' : 'REFUNDED') : paid >= total ? 'PAID' : 'PARTIAL';
        await tx.listingBooking.update({
          where: { id: lb.id },
          data: {
            paymentStatus,
            ...(paymentStatus === 'PAID' && lb.status === 'PENDING' ? { status: 'CONFIRMED' } : {}),
            ...(paymentStatus === 'REFUNDED' ? { status: 'REFUNDED' } : {}),
          },
        });
      }
    }
  }

  // ── refunds ────────────────────────────────────────────────────────────

  async refund(tenantId: string, id: string, amount?: number, reason?: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    if (!SETTLED.includes(payment.status)) throw new BadRequestException('Only a captured payment can be refunded');
    const already = BigInt(payment.refundedCents);
    const remaining = BigInt(payment.amountCents) - already;
    if (remaining <= BigInt(0)) throw new BadRequestException('Payment is already fully refunded');

    const requested = amount != null ? BigInt(Math.round(Number(amount) * 100)) : remaining;
    if (requested <= BigInt(0)) throw new BadRequestException('Refund amount must be greater than zero');
    if (requested > remaining) {
      throw new BadRequestException(`Refund exceeds the refundable balance (${Number(remaining) / 100} ${payment.currency})`);
    }

    const provider = this.providerFor(payment.gateway);
    const reference = `${payment.id}:${already}:${requested}`;
    let res;
    try {
      res = await provider.refund(payment.gatewayRef ?? '', requested, reference);
    } catch (err) {
      this.logger.error(`Refund failed for payment ${id}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The payment provider could not process the refund');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const total = already + res.refundedCents;
      const row = await tx.payment.update({
        where: { id },
        data: {
          refundedCents: total,
          refundedAt: new Date(),
          status: total >= BigInt(payment.amountCents) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await this.reconcileTargets(tx, payment);
      await this.record(tx, tenantId, id, provider.name, 'REFUNDED', {
        amountCents: res.refundedCents, currency: payment.currency, providerRef: res.providerRef,
        status: row.status, message: reason, actorId: actor?.sub, payload: res.raw,
      });
      return row;
    });

    await this.audit.log({
      tenantId, actorId: actor?.sub, actorEmail: actor?.email ?? undefined, action: 'UPDATE',
      namespace: 'finance', resource: 'payment', resourceId: id,
      beforeState: { refundedCents: Number(already) },
      afterState: { refundedCents: Number(updated.refundedCents), status: updated.status },
      metadata: { reason },
    });
    return this.serialize(updated);
  }

  // ── traveler checkout (marketplace bookings) ───────────────────────────

  /**
   * A traveler pays their own marketplace booking. The payment belongs to the
   * provider's organization; the amount is the booking total computed by the
   * server when the booking was created.
   */
  async createCheckout(payer: PayActor & { sub: string }, listingBookingId: string, idempotencyKey?: string) {
    const lb = await this.prisma.listingBooking.findFirst({
      where: { id: requireId(listingBookingId, 'Booking'), customerUserId: payer.sub },
      include: { listing: { include: { vendor: { select: { tenantId: true, name: true } } } } },
    });
    if (!lb) throw new NotFoundException('Booking not found');
    if (['CANCELLED', 'REFUNDED', 'COMPLETED'].includes(lb.status)) {
      throw new BadRequestException(`Booking is ${lb.status} and cannot be paid`);
    }
    if (lb.paymentStatus === 'PAID') throw new BadRequestException('Booking is already paid');
    const providerTenantId = lb.listing.vendor?.tenantId;
    if (!providerTenantId) throw new BadRequestException('This provider cannot accept online payments yet');

    const settled = await this.prisma.payment.aggregate({
      where: { listingBookingId: lb.id, status: { in: SETTLED } },
      _sum: { amountCents: true, refundedCents: true },
    });
    const outstanding =
      BigInt(lb.totalAmountCents) - (BigInt(settled._sum.amountCents ?? 0) - BigInt(settled._sum.refundedCents ?? 0));
    if (outstanding <= BigInt(0)) throw new BadRequestException('Nothing is outstanding');

    // Re-use an open checkout for the same booking instead of creating parallel charges.
    const open = await this.prisma.payment.findFirst({
      where: {
        listingBookingId: lb.id,
        payerUserId: payer.sub,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
        amountCents: outstanding,
      },
      orderBy: { createdAt: 'desc' },
    });
    const provider = this.activeProvider();
    if (open) {
      const fresh = Date.now() - open.createdAt.getTime() < 20 * 60 * 60 * 1000;
      if (fresh && open.gateway === provider.name && provider.name === 'stripe') {
        // Same provider idempotency key (valid 24h at Stripe) → the same PaymentIntent and client secret.
        const replay = await provider.createIntent({ amountCents: outstanding, currency: lb.currency, reference: open.idempotencyKey });
        if (replay.providerRef === open.gatewayRef) return this.checkoutView(open, replay.clientSecret);
      }
      if (open.gateway === 'stripe' && open.gatewayRef) {
        try {
          await this.stripe.cancel(open.gatewayRef);
        } catch (err) {
          // Already succeeded or processing at Stripe: do not open a second charge.
          this.logger.warn(`Could not cancel ${open.gatewayRef}: ${(err as Error).message}`);
          throw new ConflictException('A previous payment for this booking is still being processed');
        }
      }
      await this.prisma.payment.update({
        where: { id: open.id },
        data: { status: PaymentStatus.FAILED, failedAt: new Date(), failureReason: 'superseded by a new checkout' },
      });
    }
    const key = idempotencyKey?.trim() || `checkout_${lb.id}_${randomUUID()}`;

    let stripeCustomerId: string | undefined;
    if (provider === this.stripe) stripeCustomerId = await this.stripeCustomerFor(payer);

    const intent = await provider.createIntent({
      amountCents: outstanding,
      currency: lb.currency,
      reference: key,
      metadata: {
        listingBookingId: lb.id,
        providerTenantId,
        payerUserId: payer.sub,
        stripeCustomerId,
        description: `${lb.listing.name} — ${lb.listing.vendor?.name ?? 'Umrah Connect'}`,
      },
    });
    const payment = await this.prisma.payment.create({
      data: {
        tenantId: providerTenantId,
        listingBookingId: lb.id,
        payerUserId: payer.sub,
        amountCents: outstanding,
        currency: lb.currency,
        gateway: provider.name,
        gatewayRef: intent.providerRef,
        gatewayStatus: intent.status,
        gatewayResponse: intent.raw as Prisma.InputJsonValue,
        idempotencyKey: key,
        status: intent.status === 'FAILED' ? PaymentStatus.FAILED : PaymentStatus.PENDING,
      },
    });
    await this.record(this.prisma, providerTenantId, payment.id, provider.name, 'INTENT_CREATED', {
      amountCents: outstanding, currency: lb.currency, providerRef: intent.providerRef, status: intent.status,
      actorId: payer.sub, payload: intent.raw,
    });
    await this.audit.log({
      tenantId: providerTenantId, actorId: payer.sub, actorEmail: payer.email ?? undefined, action: 'PAYMENT_INITIATE',
      namespace: 'marketplace', resource: 'listing_booking_payment', resourceId: payment.id,
      metadata: { listingBookingId: lb.id, amountCents: Number(outstanding), currency: lb.currency },
    });
    return this.checkoutView(payment, intent.clientSecret);
  }

  private checkoutView(payment: Prisma.PaymentGetPayload<{}>, clientSecret?: string) {
    return {
      paymentId: payment.id,
      status: payment.status,
      amountCents: Number(payment.amountCents),
      currency: payment.currency,
      provider: payment.gateway,
      clientSecret,
      publishableKey: payment.gateway === 'stripe' ? this.stripe.publishableKey ?? null : null,
    };
  }

  private async stripeCustomerFor(payer: PayActor & { sub: string }): Promise<string> {
    const livemode = !this.stripe.testMode;
    const existing = await this.prisma.paymentCustomer.findUnique({
      where: { userId_provider_livemode: { userId: payer.sub, provider: 'stripe', livemode } },
    });
    if (existing) return existing.providerCustomerId;
    const user = await this.prisma.user.findUnique({ where: { id: payer.sub }, select: { email: true, firstName: true, lastName: true } });
    const id = await this.stripe.ensureCustomer({
      email: user?.email,
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
      reference: `user_${payer.sub}_${livemode ? 'live' : 'test'}`,
    });
    await this.prisma.paymentCustomer.upsert({
      where: { userId_provider_livemode: { userId: payer.sub, provider: 'stripe', livemode } },
      create: { userId: payer.sub, provider: 'stripe', providerCustomerId: id, livemode },
      update: {},
    });
    return id;
  }

  /** The traveler's view of their own checkout; reconciles with the provider server-side. */
  async checkoutStatus(payer: { sub: string }, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id: requireId(paymentId, 'Payment'), payerUserId: payer.sub } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.PENDING || payment.status === PaymentStatus.PROCESSING) {
      if (payment.gateway !== 'sandbox') {
        await this.reconcile(payment).catch((err) =>
          this.logger.warn(`Checkout reconcile for ${payment.id} failed: ${(err as Error).message}`),
        );
      }
    }
    const fresh = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    return this.checkoutView(fresh);
  }

  /** Sandbox only: completes a traveler checkout the way Stripe.js would. */
  async completeSandboxCheckout(payer: { sub: string }, paymentId: string, scenario?: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id: requireId(paymentId, 'Payment'), payerUserId: payer.sub } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.gateway !== 'sandbox') throw new BadRequestException('Only sandbox checkouts can be completed here');
    return this.reconcile(payment, scenario, { sub: payer.sub });
  }

  // ── webhooks ───────────────────────────────────────────────────────────

  /**
   * Verify the signature, then process at most once. A replayed delivery is
   * recognised by (provider, eventId) and acknowledged without re-applying.
   */
  async handleWebhook(providerName: string, rawBody: string, signature?: string) {
    const provider = this.providers.get(String(providerName).toLowerCase());
    if (!provider || !provider.isConfigured()) throw new NotFoundException('Unknown webhook endpoint');
    const verified = provider.verifyWebhook(rawBody, signature);
    if (!verified.valid) {
      this.logger.warn(`Webhook rejected for ${provider.name}: ${verified.reason ?? 'invalid signature'}`);
      throw new BadRequestException('Webhook signature verification failed');
    }

    const payment = verified.providerRef
      ? await this.prisma.payment.findFirst({ where: { gateway: provider.name, gatewayRef: verified.providerRef } })
      : null;

    let event;
    try {
      event = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: provider.name,
          eventId: verified.eventId,
          type: verified.type.slice(0, 80),
          paymentId: payment?.id,
          tenantId: payment?.tenantId,
          signature: signature?.slice(0, 400),
          payload: verified.raw as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const prior = await this.prisma.paymentWebhookEvent.findUnique({
          where: { provider_eventId: { provider: provider.name, eventId: verified.eventId } },
        });
        return { received: true, duplicate: true, eventId: verified.eventId, result: prior?.result ?? null };
      }
      throw err;
    }

    const result = payment ? await this.applyWebhook(provider.name, payment, verified) : 'no matching payment';
    await this.prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), result },
    });
    return { received: true, duplicate: false, eventId: verified.eventId, result };
  }

  private async applyWebhook(providerName: string, payment: Prisma.PaymentGetPayload<{}>, ev: WebhookVerification): Promise<string> {
    await this.record(this.prisma, payment.tenantId, payment.id, providerName, 'WEBHOOK_RECEIVED', {
      providerRef: ev.providerRef, status: ev.type, message: `webhook ${ev.type}`, payload: ev.raw,
    });
    switch (ev.type) {
      case 'payment.captured':
      case 'payment.succeeded': {
        const settled = await this.settle(payment.id, providerName, ev.providerRef ?? '', ev.raw, {
          amountCents: ev.amountCents,
          currency: ev.currency,
        });
        return settled.status === PaymentStatus.COMPLETED ? 'captured' : `held: ${settled.status}`;
      }
      case 'payment.failed':
        if (payment.status === PaymentStatus.COMPLETED) return 'ignored: already captured';
        await this.markFailed(payment, providerName, ev.failureReason ?? 'gateway reported failure', ev.raw);
        return 'failed';
      case 'payment.refunded': {
        if (ev.amountCents === undefined) return 'ignored: no amount';
        if (ev.amountCents <= BigInt(payment.refundedCents)) return 'ignored: already reflected';
        if (ev.amountCents > BigInt(payment.amountCents)) return 'ignored: refund exceeds amount';
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              refundedCents: ev.amountCents!,
              refundedAt: new Date(),
              status: ev.amountCents! >= BigInt(payment.amountCents) ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
            },
          });
          await this.reconcileTargets(tx, payment);
        });
        return 'refund synced';
      }
      case 'payment.disputed':
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.DISPUTED } });
        return 'disputed';
      default:
        return 'ignored';
    }
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
