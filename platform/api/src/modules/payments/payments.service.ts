import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SystemScoped } from '../../prisma/db-context';
import { AuditService } from '../audit/audit.service';
import { adjustBookingPaid } from '../bookings/booking-money';
import { requireId } from '../../common/tenant-scope';
import { CaptureResult, PaymentProvider, WebhookVerification } from './providers/payment-provider';
import { SandboxProvider } from './providers/sandbox.provider';
import { StripeProvider } from './providers/stripe.provider';

export interface PayActor {
  sub?: string;
  email?: string | null;
  tenantId?: string;
}

/** What a payer's browser receives about its checkout. Never card data, never stored secrets. */
export interface CheckoutView {
  paymentId: string;
  listingBookingId: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  provider: string;
  providerStatus: string | null;
  failureReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
  resumed: boolean;
  /** Only while the attempt can still be paid, only in the response to its owner. */
  clientSecret?: string;
  publishableKey: string | null;
  bookingStatus?: string;
  bookingPaymentStatus?: string;
}

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

/** Waiting for the payer or the provider. */
const OPEN: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.AUTHORIZED,
];
/** Captured money that has not been fully returned. */
const SETTLED: PaymentStatus[] = [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED];
/** A captured (or held) payment never goes back through capture. */
const CAPTURE_FINAL: PaymentStatus[] = [
  PaymentStatus.COMPLETED,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.DISPUTED,
];
/** Gateways the payments module drives; everything else is manual bookkeeping. */
export const PROVIDER_GATEWAYS = new Set(['sandbox', 'stripe']);

/** Payment attempts are serialised per paid record while they are opened or refunded. */
const LOCKED_TX = { maxWait: 10_000, timeout: 45_000 };
/** GET-driven reconciliation asks the provider at most this often per payment. */
const SYNC_INTERVAL_MS = 4_000;

/**
 * Money counted as received: settled payments, plus captured payments under an
 * open dispute (a chargeback is not lost until the dispute closes).
 */
function receivedWhere(where: Prisma.PaymentWhereInput): Prisma.PaymentWhereInput {
  return {
    AND: [
      where,
      {
        OR: [
          { status: { in: SETTLED } },
          { status: PaymentStatus.DISPUTED, paidAt: { not: null }, gatewayStatus: 'DISPUTE_OPEN' },
        ],
      },
    ],
  };
}

/** Provider error text can echo credentials; keep them out of the logs. */
function redact(message: unknown): string {
  return String(message ?? '').replace(
    /\b(sk|rk|pk|whsec)_(test_|live_)?[A-Za-z0-9_]+/g,
    '[redacted-key]',
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers = new Map<string, PaymentProvider>();
  private readonly lastSync = new Map<string, number>();
  readonly stripe: StripeProvider;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private audit: AuditService,
  ) {
    // The sandbox gateway never exists in production: it settles without moving money.
    if (
      !this.isProduction &&
      this.config.get<string>('PAYMENT_SANDBOX_ENABLED', 'true') !== 'false'
    ) {
      const secret =
        this.config.get<string>('SANDBOX_WEBHOOK_SECRET') ?? randomBytes(32).toString('hex');
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
    return (
      this.config.get<string>('PAYMENT_PROVIDER') ?? (this.isProduction ? 'none' : 'sandbox')
    ).toLowerCase();
  }

  /** The active provider. Clients cannot pick a different gateway. */
  activeProvider(requested?: string): PaymentProvider {
    const key = this.defaultProviderName;
    if (requested && requested.toLowerCase() !== key) {
      throw new BadRequestException(`Payment provider "${requested}" is not active`);
    }
    const p = this.providers.get(key);
    if (!p)
      throw new ServiceUnavailableException('Online payments are not enabled on this deployment');
    this.requireConfigured(p);
    return p;
  }

  /** Provider that processed an existing payment (it may differ from today's active one). */
  private providerFor(name: string): PaymentProvider {
    if (!PROVIDER_GATEWAYS.has(String(name).toLowerCase())) {
      throw new BadRequestException(
        'This is a manually recorded payment. Manage it from the finance payments list instead.',
      );
    }
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

  /**
   * A provider call whose failure (network, credentials, rejected request) must
   * reach the caller as "try again later", not as an internal error.
   */
  private async viaProvider<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(
        `Payment provider call failed (${what}): ${redact((err as Error).message)}`,
      );
      throw new ServiceUnavailableException(
        'The payment provider could not be reached. Try again.',
      );
    }
  }

  // ── ledger & locks ─────────────────────────────────────────────────────

  private async record(
    db: Db,
    tenantId: string,
    paymentId: string,
    provider: string,
    type: string,
    fields: Partial<{
      amountCents: bigint;
      currency: string;
      providerRef: string;
      status: string;
      message: string;
      payload: unknown;
      actorId: string;
    }> = {},
  ) {
    return db.paymentTransaction.create({
      data: {
        tenantId,
        paymentId,
        provider,
        type,
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

  /** Serialises work on one paid record (invoice, booking, listing booking) for this transaction. */
  private async lockKey(tx: Tx, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  /** Row lock on one payment for this transaction (refunds, webhook refund sync, disputes). */
  private async lockPayment(tx: Tx, id: string) {
    await tx.$executeRaw`SELECT 1 FROM plugin_finance.payments WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private serialize<T extends Record<string, any>>(row: T): T {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === 'gatewayResponse') continue;
      out[k] =
        typeof v === 'bigint' ? Number(v) : Array.isArray(v) ? v.map((x) => this.serialize(x)) : v;
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

  /** Net money received for one record. */
  private async received(db: Db, where: Prisma.PaymentWhereInput): Promise<bigint> {
    const agg = await db.payment.aggregate({
      where: receivedWhere(where),
      _sum: { amountCents: true, refundedCents: true },
    });
    const v = BigInt(agg._sum.amountCents ?? 0) - BigInt(agg._sum.refundedCents ?? 0);
    return v < BigInt(0) ? BigInt(0) : v;
  }

  /** Amount already promised to open (unsettled) intents for the same invoice / booking in the last 24 h. */
  private async reserved(db: Db, where: Prisma.PaymentWhereInput): Promise<bigint> {
    const agg = await db.payment.aggregate({
      where: {
        ...where,
        status: { in: OPEN },
        createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      _sum: { amountCents: true },
    });
    return BigInt(agg._sum.amountCents ?? 0);
  }

  // ── intents (organization staff) ───────────────────────────────────────

  /**
   * Create a payment intent against an invoice or a booking of the caller's
   * organization. The amount is determined by the server: the outstanding
   * balance by default, or a smaller partial amount — never more.
   * `idempotencyKey` is honoured: replaying it returns the original payment.
   * Attempts on one invoice / booking are opened one at a time, so two
   * concurrent requests cannot both reserve the same balance.
   */
  async createIntent(
    tenantId: string,
    dto: {
      amount?: number;
      amountCents?: number;
      currency?: string;
      invoiceId?: string;
      bookingId?: string;
      pilgrimId?: string;
      provider?: string;
      scenario?: string;
      idempotencyKey?: string;
    },
    actor?: PayActor,
  ) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    if (!dto.invoiceId && !dto.bookingId) {
      throw new BadRequestException('A payment must reference an invoice or a booking');
    }
    const clientKey = dto.idempotencyKey?.trim() || undefined;
    if (clientKey) {
      const existing = await this.prisma.payment.findUnique({
        where: { idempotencyKey: clientKey },
      });
      if (existing) return this.replayIntent(tenantId, existing, dto);
    }
    const target = dto.invoiceId
      ? { kind: 'invoice' as const, id: requireId(dto.invoiceId, 'Invoice') }
      : { kind: 'booking' as const, id: requireId(dto.bookingId, 'Booking') };
    const provider = this.activeProvider(dto.provider);
    const idempotencyKey = clientKey ?? `intent_${randomUUID()}`;

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockKey(tx, `pay:${target.kind}:${target.id}`);
      if (clientKey) {
        const raced = await tx.payment.findUnique({ where: { idempotencyKey: clientKey } });
        if (raced) return { kind: 'replay' as const, payment: raced };
      }

      let outstanding: bigint;
      let currency: string;
      let bookingId = dto.bookingId;
      let pilgrimId = dto.pilgrimId;
      if (target.kind === 'invoice') {
        const inv = await tx.invoice.findFirst({ where: { id: target.id, tenantId } });
        if (!inv) throw new NotFoundException('Invoice not found');
        if (['DRAFT', 'VOID', 'CANCELLED', 'PAID'].includes(String(inv.status))) {
          throw new BadRequestException(`Invoice is ${inv.status} and cannot take payments`);
        }
        outstanding = BigInt(inv.totalCents) - BigInt(inv.paidCents);
        currency = inv.currency;
        bookingId = inv.bookingId ?? undefined;
        pilgrimId = inv.pilgrimId ?? undefined;
      } else {
        const booking = await tx.booking.findFirst({ where: { id: target.id, tenantId } });
        if (!booking) throw new NotFoundException('Booking not found');
        if (['CANCELLED', 'REFUNDED'].includes(String(booking.status))) {
          throw new BadRequestException(`Booking is ${booking.status} and cannot take payments`);
        }
        outstanding = BigInt(booking.totalAmountCents) - BigInt(booking.paidAmountCents);
        currency = booking.currency;
        if (pilgrimId) {
          const p = await tx.pilgrim.findFirst({
            where: { id: requireId(pilgrimId, 'Pilgrim'), tenantId },
            select: { id: true },
          });
          if (!p) throw new NotFoundException('Pilgrim not found');
        }
      }
      const pending = await this.reserved(
        tx,
        target.kind === 'invoice'
          ? { invoiceId: target.id, tenantId }
          : { bookingId, invoiceId: null, tenantId },
      );
      outstanding -= pending;
      if (outstanding <= BigInt(0)) {
        throw new BadRequestException(
          pending > BigInt(0)
            ? 'The outstanding balance is already covered by open payment attempts'
            : 'Nothing is outstanding',
        );
      }
      if (dto.currency && dto.currency.toUpperCase() !== currency.toUpperCase()) {
        throw new BadRequestException(`Currency must be ${currency}`);
      }

      const requested =
        dto.amountCents != null
          ? BigInt(Math.round(Number(dto.amountCents)))
          : dto.amount != null
            ? BigInt(Math.round(Number(dto.amount) * 100))
            : outstanding;
      if (requested <= BigInt(0)) throw new BadRequestException('Amount must be greater than zero');
      if (requested > outstanding) {
        throw new BadRequestException(
          `Amount exceeds the outstanding balance (${Number(outstanding) / 100} ${currency})`,
        );
      }

      const intent = await this.viaProvider('create intent', () =>
        provider.createIntent({
          amountCents: requested,
          currency,
          reference: idempotencyKey,
          scenario: provider.name === 'sandbox' ? dto.scenario : undefined,
          metadata: {
            tenantId,
            invoiceId: dto.invoiceId,
            bookingId,
            description: `Umrah Connect payment ${idempotencyKey}`,
          },
        }),
      );
      const failed = intent.status === 'FAILED';
      const payment = await tx.payment.create({
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
          status: failed ? PaymentStatus.FAILED : PaymentStatus.PENDING,
          failedAt: failed ? new Date() : undefined,
          failureReason: failed ? String((intent.raw as any)?.reason ?? 'declined') : undefined,
        },
      });
      await this.record(tx, tenantId, payment.id, provider.name, 'INTENT_CREATED', {
        amountCents: requested,
        currency,
        providerRef: intent.providerRef,
        status: intent.status,
        actorId: actor?.sub,
        payload: intent.raw,
      });
      return { kind: 'created' as const, payment, clientSecret: intent.clientSecret };
    }, LOCKED_TX);

    if (created.kind === 'replay') return this.replayIntent(tenantId, created.payment, dto);
    const { payment, clientSecret } = created;
    await this.audit.log({
      tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email ?? undefined,
      action: 'PAYMENT_INITIATE',
      namespace: 'finance',
      resource: 'payment',
      resourceId: payment.id,
      afterState: { status: payment.status, gateway: provider.name },
      metadata: {
        amountCents: Number(payment.amountCents),
        currency: payment.currency,
        idempotencyKey,
      },
    });
    return { ...this.serialize(payment), clientSecret, idempotentReplay: false };
  }

  /** A replayed idempotency key returns the original attempt (and lets an open one continue). */
  private async replayIntent(
    tenantId: string,
    existing: Payment,
    dto: { invoiceId?: string; bookingId?: string },
  ) {
    const sameTarget = dto.invoiceId
      ? dto.invoiceId === existing.invoiceId
      : !dto.bookingId || dto.bookingId === existing.bookingId;
    if (existing.tenantId !== tenantId || !sameTarget) {
      throw new ConflictException('Idempotency key already used');
    }
    const { payment, clientSecret } = await this.syncWithProvider(existing);
    return { ...this.serialize(payment), clientSecret, idempotentReplay: true };
  }

  /**
   * Confirm / reconcile an intent. Sandbox captures inline. For Stripe this reads
   * the PaymentIntent server-side and settles only if Stripe says it succeeded.
   */
  async confirmIntent(tenantId: string, id: string, scenario?: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    return this.reconcile(payment, scenario, actor);
  }

  /**
   * Hand the client secret of an open card attempt back to its organization, so
   * a closed tab or a reload continues the same attempt instead of opening a
   * second one for the same balance.
   */
  async resumeIntent(tenantId: string, id: string) {
    const payment = await this.mustFindPayment(tenantId, id);
    this.providerFor(payment.gateway);
    const synced = await this.syncWithProvider(payment, { force: true });
    return { ...this.serialize(synced.payment), clientSecret: synced.clientSecret };
  }

  /**
   * Abandon an open attempt. The provider invalidates it first, so it can never
   * be paid afterwards, and only then is its reservation released.
   */
  async cancelIntent(tenantId: string, id: string, actor?: PayActor) {
    const payment = await this.mustFindPayment(tenantId, id);
    if (!OPEN.includes(payment.status)) {
      throw new BadRequestException(
        `Only an open payment attempt can be cancelled (this one is ${payment.status})`,
      );
    }
    const provider = this.providerFor(payment.gateway);
    const res = await provider.cancel(payment.gatewayRef ?? '').catch((err) => {
      this.logger.warn(`Cancel of payment ${id} failed: ${redact((err as Error).message)}`);
      throw new ServiceUnavailableException(
        'The payment provider could not be reached. Try again.',
      );
    });
    if (!res.cancelled) {
      const current = res.state
        ? await this.applyProviderState(payment, res.state, actor)
        : payment;
      throw new ConflictException({
        message:
          'This payment can no longer be cancelled: the provider is processing or has completed it.',
        details: { paymentId: payment.id, status: current.status },
      });
    }
    return this.serialize(
      await this.markFailed(payment, provider.name, 'cancelled by staff', {}, actor),
    );
  }

  private async reconcile(payment: Payment, scenario?: string, actor?: PayActor) {
    if (payment.status === PaymentStatus.COMPLETED)
      throw new BadRequestException('Payment is already captured');
    if (
      payment.status === PaymentStatus.REFUNDED ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException('Payment has been refunded');
    }
    if (payment.status === PaymentStatus.FAILED) {
      throw new BadRequestException('Payment already failed — create a new intent');
    }
    if (payment.status === PaymentStatus.DISPUTED) {
      throw new BadRequestException('Payment is on hold for review and cannot be confirmed');
    }

    const provider = this.providerFor(payment.gateway);
    if (provider.name === 'sandbox') await this.assertStillPayable(payment);
    const res = await provider.confirm(
      payment.gatewayRef ?? '',
      provider.name === 'sandbox' ? scenario : undefined,
    );
    return this.serialize(await this.applyProviderState(payment, res, actor));
  }

  /** Records what the provider reported and returns the payment as it now stands. */
  private async applyProviderState(
    payment: Payment,
    res: CaptureResult,
    actor?: PayActor,
  ): Promise<Payment> {
    if (res.status === 'CAPTURED') {
      const reported = { amountCents: res.amountCents, currency: res.currency };
      return (
        await this.settle(payment.id, payment.gateway, res.providerRef, res.raw, reported, actor)
      ).payment;
    }
    if (res.status === 'FAILED') {
      return this.markFailed(
        payment,
        payment.gateway,
        res.failureReason ?? 'capture_failed',
        res.raw,
        actor,
      );
    }
    // Guarded: never step back from a state a webhook may have written meanwhile.
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: OPEN } },
      data: {
        status: res.status === 'PROCESSING' ? PaymentStatus.PROCESSING : PaymentStatus.PENDING,
        gatewayStatus: String(res.providerStatus ?? res.status).slice(0, 50),
        // The last declined attempt, while the same intent can still be retried.
        failureReason: res.lastError ? res.lastError.slice(0, 200) : null,
      },
    });
    return this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
  }

  /**
   * Bring an open payment up to date with its provider. Read-only at the
   * provider; throttled for GET-driven polling. Returns the client secret only
   * while the intent can still be paid, for the caller to hand to its owner.
   */
  private async syncWithProvider(
    payment: Payment,
    opts: { force?: boolean } = {},
  ): Promise<{ payment: Payment; clientSecret?: string }> {
    if (!OPEN.includes(payment.status)) return { payment };
    const provider = this.providers.get(String(payment.gateway).toLowerCase());
    if (!provider?.retrieve || !provider.isConfigured() || !payment.gatewayRef) return { payment };
    const last = this.lastSync.get(payment.id) ?? 0;
    if (!opts.force && Date.now() - last < SYNC_INTERVAL_MS) return { payment };
    if (this.lastSync.size > 5_000) this.lastSync.clear();
    this.lastSync.set(payment.id, Date.now());
    try {
      const state = await provider.retrieve(payment.gatewayRef);
      const fresh = await this.applyProviderState(payment, state);
      return {
        payment: fresh,
        clientSecret: fresh.status === PaymentStatus.PENDING ? state.clientSecret : undefined,
      };
    } catch (err) {
      this.logger.warn(
        `Provider sync for payment ${payment.id} failed: ${redact((err as Error).message)}`,
      );
      if (opts.force)
        throw new ServiceUnavailableException(
          'The payment provider could not be reached. Try again.',
        );
      return { payment };
    }
  }

  /** Server-side captures must not push an invoice / booking past its total. */
  private async assertStillPayable(payment: Payment) {
    let total: bigint | undefined;
    let paid = BigInt(0);
    if (payment.invoiceId) {
      const inv = await this.prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
      total = inv ? BigInt(inv.totalCents) : undefined;
      paid = await this.received(this.prisma, { invoiceId: payment.invoiceId });
    } else if (payment.listingBookingId) {
      const lb = await this.prisma.listingBooking.findUnique({
        where: { id: payment.listingBookingId },
      });
      total = lb ? BigInt(lb.totalAmountCents) : undefined;
      paid = await this.received(this.prisma, { listingBookingId: payment.listingBookingId });
    } else if (payment.bookingId) {
      const b = await this.prisma.booking.findUnique({ where: { id: payment.bookingId } });
      total = b ? BigInt(b.totalAmountCents) : undefined;
      paid = b ? BigInt(b.paidAmountCents) : BigInt(0);
    }
    if (total !== undefined && paid + BigInt(payment.amountCents) > total) {
      await this.markFailed(
        payment,
        payment.gateway,
        'balance already settled by another payment',
        {},
      );
      throw new ConflictException(
        'This payment would exceed the outstanding balance and was cancelled',
      );
    }
  }

  private async markFailed(
    payment: Payment,
    providerName: string,
    reason: string,
    raw: Record<string, unknown>,
    actor?: PayActor,
  ): Promise<Payment> {
    // Guarded: a capture that landed meanwhile must never be overwritten with a failure.
    const moved = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { in: OPEN } },
      data: {
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
        failureReason: reason.slice(0, 200),
        gatewayStatus: 'FAILED',
        gatewayResponse: raw as Prisma.InputJsonValue,
      },
    });
    const current = await this.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (moved.count === 0) return current;
    await this.record(this.prisma, payment.tenantId, payment.id, providerName, 'FAILED', {
      amountCents: BigInt(payment.amountCents),
      currency: payment.currency,
      message: reason,
      actorId: actor?.sub,
      payload: raw,
      status: 'FAILED',
    });
    await this.audit.log({
      tenantId: payment.tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email ?? undefined,
      action: 'PAYMENT_FAIL',
      namespace: 'finance',
      resource: 'payment',
      resourceId: payment.id,
      afterState: { status: current.status },
      metadata: { reason },
    });
    return current;
  }

  /**
   * Mark captured and reconcile everything the payment pays for — in one
   * transaction, exactly once, and only if the provider-reported amount and
   * currency match the record. A mismatch holds the payment as DISPUTED.
   */
  private async settle(
    id: string,
    providerName: string,
    providerRef: string,
    raw: Record<string, unknown>,
    reported: { amountCents?: bigint; currency?: string } = {},
    actor?: PayActor,
  ): Promise<{ payment: Payment; outcome: string }> {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    if (payment.status === PaymentStatus.DISPUTED)
      return { payment, outcome: 'ignored: payment is on hold' };
    if (CAPTURE_FINAL.includes(payment.status)) return { payment, outcome: 'already settled' };

    const expected = BigInt(payment.amountCents);
    const mismatch =
      (reported.amountCents !== undefined && reported.amountCents !== expected) ||
      (reported.currency !== undefined &&
        reported.currency.toUpperCase() !== payment.currency.toUpperCase());
    if (mismatch) {
      this.logger.error(
        `Payment ${id}: provider amount/currency does not match the record — not settled`,
      );
      const held = await this.prisma.payment.updateMany({
        where: { id, status: { notIn: CAPTURE_FINAL } },
        data: {
          status: PaymentStatus.DISPUTED,
          gatewayStatus: 'AMOUNT_MISMATCH',
          gatewayResponse: raw as Prisma.InputJsonValue,
        },
      });
      if (held.count > 0) {
        await this.record(this.prisma, payment.tenantId, id, providerName, 'AMOUNT_MISMATCH', {
          amountCents: reported.amountCents ?? BigInt(0),
          currency: reported.currency ?? payment.currency,
          providerRef,
          status: 'HELD',
          message: `expected ${expected} ${payment.currency}`,
          payload: raw,
        });
      }
      const current = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
      return { payment: current, outcome: 'held: amount mismatch' };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id, status: { notIn: CAPTURE_FINAL } },
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
      if (claimed.count === 0) return { claimed: false, overpaid: BigInt(0) };
      const { overpaidCents } = await this.reconcileTargets(tx, payment, expected);
      await this.record(tx, payment.tenantId, id, providerName, 'CAPTURED', {
        amountCents: expected,
        currency: payment.currency,
        providerRef,
        status: 'CAPTURED',
        actorId: actor?.sub,
        payload: raw,
      });
      if (overpaidCents > BigInt(0)) {
        // The money already moved at the provider, so it is recorded — and flagged for a refund.
        await this.record(tx, payment.tenantId, id, providerName, 'OVERPAYMENT', {
          amountCents: overpaidCents,
          currency: payment.currency,
          providerRef,
          status: 'REFUND_REQUIRED',
          message: 'captured more than the outstanding balance; refund the difference',
        });
      }
      return { claimed: true, overpaid: overpaidCents };
    });
    const updated = await this.prisma.payment.findUniqueOrThrow({ where: { id } });
    if (!result.claimed) return { payment: updated, outcome: 'already settled' };
    if (result.overpaid > BigInt(0)) {
      this.logger.warn(
        `Payment ${id} over-collected ${result.overpaid} ${payment.currency}; refund required`,
      );
    }
    await this.audit.log({
      tenantId: payment.tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email ?? undefined,
      action: 'PAYMENT_COMPLETE',
      namespace: 'finance',
      resource: 'payment',
      resourceId: id,
      afterState: { status: updated.status },
      metadata: { providerRef, overpaidCents: Number(result.overpaid) },
    });
    return { payment: updated, outcome: 'captured' };
  }

  /**
   * Recompute what the payment pays for. Invoices and marketplace bookings are
   * summed from their payments; an operator booking's paid amount moves by
   * `bookingDeltaCents` (it also carries the deposit recorded at creation).
   */
  private async reconcileTargets(
    tx: Tx,
    payment: {
      invoiceId: string | null;
      bookingId: string | null;
      listingBookingId: string | null;
    },
    bookingDeltaCents: bigint,
  ): Promise<{ overpaidCents: bigint }> {
    let overpaidCents = BigInt(0);
    if (payment.invoiceId) {
      const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (inv) {
        const paid = await this.received(tx, { invoiceId: inv.id });
        const total = BigInt(inv.totalCents);
        const keepLabel = ['DRAFT', 'SENT', 'OVERDUE', 'VOID', 'CANCELLED'].includes(inv.status);
        const terminal = inv.status === 'VOID' || inv.status === 'CANCELLED';
        const status = terminal
          ? inv.status
          : paid <= BigInt(0)
            ? keepLabel
              ? inv.status
              : 'ISSUED'
            : paid >= total
              ? 'PAID'
              : 'PARTIALLY_PAID';
        await tx.invoice.update({
          where: { id: inv.id },
          data: {
            paidCents: paid,
            status: status as any,
            paidAt: status === 'PAID' ? (inv.paidAt ?? new Date()) : null,
          },
        });
        if (paid > total) overpaidCents = paid - total;
      }
    }
    if (payment.bookingId) await adjustBookingPaid(tx, payment.bookingId, bookingDeltaCents);
    if (payment.listingBookingId) {
      const lb = await tx.listingBooking.findUnique({ where: { id: payment.listingBookingId } });
      if (lb) {
        const paid = await this.received(tx, { listingBookingId: lb.id });
        const total = BigInt(lb.totalAmountCents);
        const refunds = await tx.payment.aggregate({
          where: { listingBookingId: lb.id },
          _sum: { refundedCents: true },
        });
        const anyRefund = BigInt(refunds._sum.refundedCents ?? 0) > BigInt(0);
        const paymentStatus =
          paid <= BigInt(0)
            ? anyRefund
              ? 'REFUNDED'
              : 'UNPAID'
            : paid >= total
              ? 'PAID'
              : 'PARTIAL';
        await tx.listingBooking.update({
          where: { id: lb.id },
          data: {
            paymentStatus,
            ...(paymentStatus === 'PAID' && lb.status === 'PENDING' ? { status: 'CONFIRMED' } : {}),
            ...(paymentStatus === 'REFUNDED' ? { status: 'REFUNDED' } : {}),
          },
        });
        if (!payment.invoiceId && paid > total) overpaidCents = paid - total;
      }
    }
    return { overpaidCents };
  }

  // ── refunds ────────────────────────────────────────────────────────────

  /**
   * Refund a captured gateway payment through its provider. The payment row is
   * locked for the whole operation, so concurrent refunds are serialised and the
   * provider idempotency reference (payment, already refunded, amount) is stable.
   */
  async refund(tenantId: string, id: string, amount?: number, reason?: string, actor?: PayActor) {
    const payment0 = await this.mustFindPayment(tenantId, id);
    const provider = this.providerFor(payment0.gateway);

    const { updated, already, refunded } = await this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, id);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (!SETTLED.includes(payment.status))
        throw new BadRequestException('Only a captured payment can be refunded');
      const already = BigInt(payment.refundedCents);
      const remaining = BigInt(payment.amountCents) - already;
      if (remaining <= BigInt(0))
        throw new BadRequestException('Payment is already fully refunded');

      const requested = amount != null ? BigInt(Math.round(Number(amount) * 100)) : remaining;
      if (requested <= BigInt(0))
        throw new BadRequestException('Refund amount must be greater than zero');
      if (requested > remaining) {
        throw new BadRequestException(
          `Refund exceeds the refundable balance (${Number(remaining) / 100} ${payment.currency})`,
        );
      }

      let res;
      try {
        res = await provider.refund(
          payment.gatewayRef ?? '',
          requested,
          `${payment.id}:${already}:${requested}`,
        );
      } catch (err) {
        this.logger.error(`Refund failed for payment ${id}: ${redact((err as Error).message)}`);
        throw new ServiceUnavailableException('The payment provider could not process the refund');
      }
      const total = already + res.refundedCents;
      const row = await tx.payment.update({
        where: { id },
        data: {
          refundedCents: total,
          refundedAt: new Date(),
          status:
            total >= BigInt(payment.amountCents)
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await this.reconcileTargets(tx, payment, -res.refundedCents);
      await this.record(tx, tenantId, id, provider.name, 'REFUNDED', {
        amountCents: res.refundedCents,
        currency: payment.currency,
        providerRef: res.providerRef,
        status: row.status,
        message: reason,
        actorId: actor?.sub,
        payload: res.raw,
      });
      return { updated: row, already, refunded: res.refundedCents };
    }, LOCKED_TX);

    await this.audit.log({
      tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email ?? undefined,
      action: 'UPDATE',
      namespace: 'finance',
      resource: 'payment',
      resourceId: id,
      beforeState: { refundedCents: Number(already) },
      afterState: { refundedCents: Number(updated.refundedCents), status: updated.status },
      metadata: { reason, refundedCents: Number(refunded) },
    });
    return this.serialize(updated);
  }

  // ── traveler checkout (marketplace bookings) ───────────────────────────

  /**
   * A traveler pays their own marketplace booking. The payment belongs to the
   * provider's organization; the amount is the booking's outstanding balance,
   * computed by the server from the booking total and recorded payments.
   *
   * Re-entering checkout (a double click, a second tab, a reload) resumes the
   * open attempt instead of creating a second PaymentIntent for the same
   * balance. A new attempt is opened only when none is open; an attempt for a
   * different balance is cancelled at the provider first.
   */
  // R05: the traveler pays a PROVIDER organization — payment rows belong to the provider's tenant.
  @SystemScoped('payments.traveler-checkout')
  async createCheckout(
    payer: PayActor & { sub: string },
    listingBookingId: string,
    retried = false,
  ): Promise<CheckoutView> {
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
    if (!providerTenantId)
      throw new BadRequestException('This provider cannot accept online payments yet');
    const providerOrg = await this.prisma.tenant.findUnique({
      where: { id: providerTenantId },
      select: { status: true, deletedAt: true },
    });
    if (!providerOrg || providerOrg.deletedAt || providerOrg.status !== 'ACTIVE') {
      throw new BadRequestException('This provider cannot accept online payments right now');
    }
    const provider = this.activeProvider();
    const stripeCustomerId =
      provider === this.stripe
        ? await this.viaProvider('ensure customer', () => this.stripeCustomerFor(payer))
        : undefined;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockKey(tx, `checkout:${lb.id}`);
      const outstanding =
        BigInt(lb.totalAmountCents) - (await this.received(tx, { listingBookingId: lb.id }));
      if (outstanding <= BigInt(0)) throw new BadRequestException('Nothing is outstanding');

      const open = await tx.payment.findFirst({
        where: { listingBookingId: lb.id, status: { in: OPEN } },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        if (open.gateway === provider.name && BigInt(open.amountCents) === outstanding) {
          return { kind: 'resume' as const, payment: open };
        }
        // The balance or the gateway changed: invalidate the old attempt at the provider first.
        const cancelled = await this.providers
          .get(open.gateway)
          ?.cancel(open.gatewayRef ?? '')
          .catch(() => {
            throw new ServiceUnavailableException(
              'The payment provider could not be reached. Try again.',
            );
          });
        if (cancelled && !cancelled.cancelled) {
          throw new ConflictException({
            message: 'A previous payment for this booking is still being processed',
            details: { paymentId: open.id },
          });
        }
        await tx.payment.update({
          where: { id: open.id },
          data: {
            status: PaymentStatus.FAILED,
            failedAt: new Date(),
            failureReason: 'superseded by a new checkout',
          },
        });
      }

      const key = `checkout_${lb.id}_${randomUUID()}`;
      const intent = await this.viaProvider('create intent', () =>
        provider.createIntent({
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
        }),
      );
      const failed = intent.status === 'FAILED';
      const payment = await tx.payment.create({
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
          status: failed ? PaymentStatus.FAILED : PaymentStatus.PENDING,
          failedAt: failed ? new Date() : undefined,
        },
      });
      await this.record(tx, providerTenantId, payment.id, provider.name, 'INTENT_CREATED', {
        amountCents: outstanding,
        currency: lb.currency,
        providerRef: intent.providerRef,
        status: intent.status,
        actorId: payer.sub,
        payload: intent.raw,
      });
      return { kind: 'created' as const, payment, clientSecret: intent.clientSecret };
    }, LOCKED_TX);

    if (outcome.kind === 'resume') {
      const synced = await this.syncWithProvider(outcome.payment, { force: true });
      // The provider cancelled the open attempt meanwhile: open a fresh one, once.
      if (synced.payment.status === PaymentStatus.FAILED && !retried) {
        return this.createCheckout(payer, listingBookingId, true);
      }
      return this.checkoutView(synced.payment, {
        clientSecret: synced.clientSecret,
        resumed: true,
      });
    }
    const { payment: created, clientSecret } = outcome;
    await this.audit.log({
      tenantId: providerTenantId,
      actorId: payer.sub,
      actorEmail: payer.email ?? undefined,
      action: 'PAYMENT_INITIATE',
      namespace: 'marketplace',
      resource: 'listing_booking_payment',
      resourceId: created.id,
      metadata: {
        listingBookingId: lb.id,
        amountCents: Number(created.amountCents),
        currency: lb.currency,
      },
    });
    return this.checkoutView(created, { clientSecret, resumed: false });
  }

  /** Everything a payer's browser may see about its checkout. Never card data. */
  private checkoutView(
    payment: Payment,
    extra: {
      clientSecret?: string;
      resumed?: boolean;
      booking?: { status: string; paymentStatus: string } | null;
    } = {},
  ): CheckoutView {
    return {
      paymentId: payment.id,
      listingBookingId: payment.listingBookingId,
      status: payment.status,
      amountCents: Number(payment.amountCents),
      currency: payment.currency,
      provider: payment.gateway,
      providerStatus: payment.gatewayStatus,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      resumed: extra.resumed ?? false,
      clientSecret: extra.clientSecret,
      publishableKey: payment.gateway === 'stripe' ? (this.stripe.publishableKey ?? null) : null,
      ...(extra.booking
        ? { bookingStatus: extra.booking.status, bookingPaymentStatus: extra.booking.paymentStatus }
        : {}),
    };
  }

  private async stripeCustomerFor(payer: PayActor & { sub: string }): Promise<string> {
    const livemode = !this.stripe.testMode;
    const existing = await this.prisma.paymentCustomer.findUnique({
      where: { userId_provider_livemode: { userId: payer.sub, provider: 'stripe', livemode } },
    });
    if (existing) return existing.providerCustomerId;
    const user = await this.prisma.user.findUnique({
      where: { id: payer.sub },
      select: { email: true, firstName: true, lastName: true },
    });
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
  // R05: the payment belongs to the provider's tenant; pinned to payerUserId below.
  @SystemScoped('payments.traveler-checkout')
  async checkoutStatus(payer: { sub: string }, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: requireId(paymentId, 'Payment'), payerUserId: payer.sub },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const { payment: fresh } = await this.syncWithProvider(payment);
    const booking = fresh.listingBookingId
      ? await this.prisma.listingBooking.findUnique({
          where: { id: fresh.listingBookingId },
          select: { status: true, paymentStatus: true },
        })
      : null;
    return this.checkoutView(fresh, { booking });
  }

  /** Sandbox only (never in production): completes a traveler checkout the way Stripe.js would. */
  // R05: settles the provider's records for the traveler's own payment (payerUserId below).
  @SystemScoped('payments.traveler-checkout')
  async completeSandboxCheckout(payer: { sub: string }, paymentId: string, scenario?: string) {
    if (this.isProduction) throw new NotFoundException('Not found');
    const payment = await this.prisma.payment.findFirst({
      where: { id: requireId(paymentId, 'Payment'), payerUserId: payer.sub },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.gateway !== 'sandbox')
      throw new BadRequestException('Only sandbox checkouts can be completed here');
    await this.reconcile(payment, scenario, { sub: payer.sub });
    return this.checkoutStatus(payer, paymentId);
  }

  // ── webhooks ───────────────────────────────────────────────────────────

  /**
   * Verify the signature, then process at most once. A replayed delivery is
   * recognised by (provider, eventId) and acknowledged without re-applying. A
   * delivery that fails while processing is forgotten and answered with an
   * error, so the provider's retry is processed instead of being taken for a
   * duplicate; an event left unprocessed by a crash is taken over by a later retry.
   */
  // R05: a signed provider event, not a principal, drives the change (signature checked first below).
  @SystemScoped('payments.webhook')
  async handleWebhook(providerName: string, rawBody: string, signature?: string) {
    const provider = this.providers.get(String(providerName).toLowerCase());
    if (!provider || !provider.isConfigured())
      throw new NotFoundException('Unknown webhook endpoint');
    const verified = provider.verifyWebhook(rawBody, signature);
    if (!verified.valid) {
      this.logger.warn(
        `Webhook rejected for ${provider.name}: ${verified.reason ?? 'invalid signature'}`,
      );
      throw new BadRequestException('Webhook signature verification failed');
    }

    const payment = verified.providerRef
      ? await this.prisma.payment.findFirst({
          where: { gateway: provider.name, gatewayRef: verified.providerRef },
        })
      : null;
    const eventKey = { provider_eventId: { provider: provider.name, eventId: verified.eventId } };

    let event = await this.prisma.paymentWebhookEvent.findUnique({ where: eventKey });
    if (event && (event.processedAt || Date.now() - event.createdAt.getTime() < 2 * 60 * 1000)) {
      return {
        received: true,
        duplicate: true,
        eventId: verified.eventId,
        result: event.result ?? null,
      };
    }
    const takenOver = !!event;
    if (!event) {
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
          const prior = await this.prisma.paymentWebhookEvent.findUnique({ where: eventKey });
          return {
            received: true,
            duplicate: true,
            eventId: verified.eventId,
            result: prior?.result ?? null,
          };
        }
        throw err;
      }
    }

    let result: string;
    try {
      result = payment
        ? await this.applyWebhook(provider.name, payment, verified)
        : 'no matching payment';
    } catch (err) {
      this.logger.error(`Webhook ${verified.eventId} failed: ${redact((err as Error).message)}`);
      if (!takenOver) {
        await this.prisma.paymentWebhookEvent
          .delete({ where: { id: event.id } })
          .catch(() => undefined);
      }
      throw new ServiceUnavailableException('The webhook could not be processed; retry later');
    }
    await this.prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), result: result.slice(0, 200) },
    });
    return { received: true, duplicate: false, eventId: verified.eventId, result };
  }

  /**
   * Apply one verified event. Stripe does not guarantee delivery order
   * (docs.stripe.com/webhooks, "Event ordering"), so every branch reads the
   * current record and only moves it forward: a late failure never undoes a
   * capture, a late capture never lifts a hold, and a refund that arrives before
   * its capture first records the capture the refunded charge proves.
   */
  private async applyWebhook(
    providerName: string,
    payment: Payment,
    ev: WebhookVerification,
  ): Promise<string> {
    if (
      providerName === 'stripe' &&
      ev.livemode !== undefined &&
      ev.livemode === this.stripe.testMode
    ) {
      this.logger.warn(
        `Ignoring Stripe event ${ev.eventId}: livemode=${ev.livemode} does not match the configured key`,
      );
      return 'ignored: livemode mismatch';
    }
    if (ev.reference && ev.reference !== payment.idempotencyKey) {
      this.logger.warn(
        `Ignoring event ${ev.eventId}: its reference does not match payment ${payment.id}`,
      );
      return 'ignored: reference mismatch';
    }
    await this.record(this.prisma, payment.tenantId, payment.id, providerName, 'WEBHOOK_RECEIVED', {
      providerRef: ev.providerRef,
      status: ev.type,
      message: `webhook ${ev.type}`,
      payload: ev.raw,
    });
    switch (ev.type) {
      case 'payment.captured':
      case 'payment.succeeded': {
        const reported = { amountCents: ev.amountCents, currency: ev.currency };
        return (await this.settle(payment.id, providerName, ev.providerRef ?? '', ev.raw, reported))
          .outcome;
      }
      case 'payment.processing': {
        const moved = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: { in: OPEN } },
          data: { status: PaymentStatus.PROCESSING, gatewayStatus: 'processing' },
        });
        return moved.count ? 'processing' : `ignored: already ${payment.status}`;
      }
      case 'payment.attempt_failed': {
        // The intent stays payable; only a cancellation fails it for good.
        const reason = (ev.failureReason ?? 'payment_failed').slice(0, 200);
        const moved = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: { in: OPEN } },
          data: {
            status: PaymentStatus.PENDING,
            gatewayStatus: 'requires_payment_method',
            failureReason: reason,
          },
        });
        if (moved.count) return `attempt declined: ${reason}`;
        return payment.status === PaymentStatus.FAILED
          ? 'ignored: already failed'
          : 'ignored: already captured';
      }
      case 'payment.failed': {
        if (payment.status === PaymentStatus.FAILED) return 'ignored: already failed';
        if (!OPEN.includes(payment.status)) return 'ignored: already captured';
        const reason = ev.failureReason ?? 'gateway reported failure';
        const failed = await this.markFailed(payment, providerName, reason, ev.raw);
        return failed.status === PaymentStatus.FAILED ? 'failed' : 'ignored: already captured';
      }
      case 'payment.refunded':
        return this.syncRefundFromWebhook(providerName, payment, ev);
      case 'payment.disputed':
        return this.openDispute(providerName, payment, ev);
      case 'payment.dispute_closed':
        return this.closeDispute(providerName, payment, ev);
      default:
        return 'ignored';
    }
  }

  private async syncRefundFromWebhook(
    providerName: string,
    payment: Payment,
    ev: WebhookVerification,
  ) {
    if (ev.amountCents === undefined) return 'ignored: no amount';
    // A refunded charge proves its capture. Record the capture first when its own
    // event has not arrived yet — with the usual amount / currency check.
    if (OPEN.includes(payment.status) || payment.status === PaymentStatus.FAILED) {
      if (ev.capturedCents === undefined)
        return 'ignored: authorisation released, nothing was captured';
      const reported = { amountCents: ev.capturedCents, currency: ev.currency };
      await this.settle(payment.id, providerName, ev.providerRef ?? '', ev.raw, reported);
    }
    const cumulative = ev.amountCents;
    return this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, payment.id);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (cumulative > BigInt(p.amountCents)) {
        this.logger.warn(`Refund event ${ev.eventId} exceeds payment ${p.id}`);
        return 'ignored: refund exceeds amount';
      }
      if (cumulative <= BigInt(p.refundedCents)) return 'ignored: already reflected';
      const delta = cumulative - BigInt(p.refundedCents);
      if (p.status === PaymentStatus.DISPUTED) {
        // Money returned on a held payment: keep the hold, record what the provider reports.
        await tx.payment.update({
          where: { id: p.id },
          data: { refundedCents: cumulative, refundedAt: new Date() },
        });
        await this.record(tx, p.tenantId, p.id, providerName, 'REFUND_SYNCED', {
          amountCents: delta,
          currency: p.currency,
          status: p.status,
          message: 'refund recorded on a held payment',
        });
        return 'refund recorded on held payment';
      }
      if (!SETTLED.includes(p.status)) return 'deferred: capture not recorded';
      const row = await tx.payment.update({
        where: { id: p.id },
        data: {
          refundedCents: cumulative,
          refundedAt: new Date(),
          status:
            cumulative >= BigInt(p.amountCents)
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      await this.reconcileTargets(tx, p, -delta);
      await this.record(tx, p.tenantId, p.id, providerName, 'REFUND_SYNCED', {
        amountCents: delta,
        currency: p.currency,
        providerRef: ev.providerRef,
        status: row.status,
        message: 'refund reported by the provider',
      });
      return 'refund synced';
    }, LOCKED_TX);
  }

  private async openDispute(providerName: string, payment: Payment, ev: WebhookVerification) {
    const moved = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: { not: PaymentStatus.DISPUTED } },
      data: { status: PaymentStatus.DISPUTED, gatewayStatus: 'DISPUTE_OPEN' },
    });
    if (!moved.count) return 'ignored: already on hold';
    await this.record(this.prisma, payment.tenantId, payment.id, providerName, 'DISPUTE_OPENED', {
      amountCents: BigInt(payment.amountCents),
      currency: payment.currency,
      providerRef: ev.providerRef,
      status: 'DISPUTED',
      message: 'the payer opened a dispute; the payment is on hold',
    });
    await this.audit.log({
      tenantId: payment.tenantId,
      action: 'UPDATE',
      namespace: 'finance',
      resource: 'payment',
      resourceId: payment.id,
      beforeState: { status: payment.status },
      afterState: { status: PaymentStatus.DISPUTED },
      metadata: { eventId: ev.eventId },
    });
    return payment.paidAt ? 'disputed' : 'disputed (capture not recorded)';
  }

  private async closeDispute(providerName: string, payment: Payment, ev: WebhookVerification) {
    if (payment.status !== PaymentStatus.DISPUTED || payment.gatewayStatus !== 'DISPUTE_OPEN')
      return 'ignored';
    const won = ev.disputeStatus === 'won';
    return this.prisma.$transaction(async (tx) => {
      await this.lockPayment(tx, payment.id);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (p.status !== PaymentStatus.DISPUTED || p.gatewayStatus !== 'DISPUTE_OPEN')
        return 'ignored';
      if (won && p.paidAt) {
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status:
              BigInt(p.refundedCents) > BigInt(0)
                ? PaymentStatus.PARTIALLY_REFUNDED
                : PaymentStatus.COMPLETED,
            gatewayStatus: 'DISPUTE_WON',
          },
        });
      } else {
        await tx.payment.update({
          where: { id: p.id },
          data: { gatewayStatus: won ? 'DISPUTE_WON' : 'DISPUTE_LOST' },
        });
        // A lost chargeback: the money is gone, so it stops counting towards what it paid for.
        if (!won && p.paidAt)
          await this.reconcileTargets(tx, p, -(BigInt(p.amountCents) - BigInt(p.refundedCents)));
      }
      await this.record(tx, p.tenantId, p.id, providerName, won ? 'DISPUTE_WON' : 'DISPUTE_LOST', {
        amountCents: BigInt(p.amountCents),
        currency: p.currency,
        providerRef: ev.providerRef,
        status: ev.disputeStatus,
      });
      return won ? 'dispute won' : 'dispute lost';
    }, LOCKED_TX);
  }

  // ── reads ──────────────────────────────────────────────────────────────

  async transactions(tenantId: string, paymentId: string) {
    await this.mustFindPayment(tenantId, paymentId);
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { tenantId, paymentId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r: Record<string, any>) => this.serialize(r));
  }

  /** A payment of the caller's organization, reconciled with its provider while it is open. */
  async findOne(tenantId: string, id: string) {
    const payment = await this.mustFindPayment(tenantId, id);
    const { payment: fresh } = await this.syncWithProvider(payment);
    const transactions = await this.transactions(tenantId, id);
    return { ...this.serialize(fresh), transactions };
  }
}
