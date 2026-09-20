import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { Observable, catchError, from, map, of, switchMap, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { currentDbContext } from '../../prisma/db-context';

/**
 * N-FORM-1 — duplicate submission is refused by the SERVER (A12-1).
 *
 * `apps/web/lib/single-flight.ts` joins identical writes that overlap in one tab.
 * A second tab, a retry after a token refresh, a flaky connection or any API
 * client walks straight past it: A12 sent five identical `POST /pilgrims` and got
 * five pilgrims, and reproduced the same thing through the UI in two browser tabs.
 *
 * So a create that carries an `Idempotency-Key` is settled here:
 *
 *  1. The request CLAIMS the key by inserting a row — one row per (user, key),
 *     enforced by a unique index, so exactly one of five concurrent duplicates
 *     wins and the other four never reach the handler.
 *  2. The winner runs the handler and stores its response. A failure releases the
 *     key, so the caller may correct the request and send it again.
 *  3. The losers wait for the winner and replay its response, with
 *     `Idempotent-Replay: true`. Nothing is created twice.
 *  4. The same key with a DIFFERENT body is a 409: the client has reused a key
 *     for a different request, which no answer can be right for.
 *
 * A request without the header is untouched — this adds a guarantee, it does not
 * change any existing behaviour. Money is deliberately out of scope: payments
 * carry their own, older idempotency (Payment.idempotencyKey) which also reaches
 * the provider, and two layers of replay over one charge is how double refunds
 * are born.
 */

/** How long a key is honoured. A retry after this window is a new request. */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;
/** How long a loser waits for the winner's answer before giving up with a 409. */
const WAIT_FOR_WINNER_MS = 30_000;
const POLL_INTERVAL_MS = 40;
/** Sweep the caller's own expired keys on roughly one claim in fifty. */
const SWEEP_PROBABILITY = 0.02;

/**
 * Paths that settle duplicates themselves and must not be wrapped in a second
 * layer of replay (tested by test/idempotency.e2e-spec.ts).
 *  - /auth/*   a session or a credential check — replaying a login is not a create.
 *  - money     payments and the finance routes that record or refund one.
 */
const EXEMPT = [
  /^\/auth(\/|$)/,
  /^\/payments(\/|$)/,
  /^\/finance\/invoices\/[^/]+\/payments$/,
  /^\/finance\/payments\/[^/]+\/refund$/,
];

export function isExemptPath(path: string): boolean {
  return EXEMPT.some((rule) => rule.test(path));
}

/** The route as the rules above see it: no /api/v1 prefix, no query string. */
export function routePath(url: string): string {
  const path = (url || '/').split('?')[0].replace(/\/+$/, '') || '/';
  return path.replace(/^\/api\/v\d+/, '') || '/';
}

/** Stable fingerprint of a request body — key order must not make two calls differ. */
export function bodyFingerprint(body: unknown): string {
  return createHash('sha256').update(canonical(body)).digest('hex');
}

function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

/**
 * Exactly what the client would have received: the BigInt/Date shapes the JSON
 * serializer produces (money is bigint minor units), so a replay is byte-for-byte
 * the first answer rather than a second rendering of it.
 */
function asStoredJson(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload ?? null));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = this.usableKey(request);
    if (!key) return next.handle();

    return from(this.claim(request, key)).pipe(
      switchMap((claim) => {
        if (claim.replayed) {
          response.setHeader('Idempotent-Replay', 'true');
          return of(claim.response);
        }
        return next.handle().pipe(
          // Store before answering: the answer must never reach the client before
          // the record that stops the next duplicate.
          switchMap((payload) =>
            from(this.complete(claim.id, response.statusCode, payload)).pipe(
              map(() => {
                response.setHeader('Idempotent-Replay', 'false');
                return payload;
              }),
            ),
          ),
          // The create failed, so nothing was created: release the key so the
          // caller can correct the request and send it again.
          catchError((err) =>
            from(this.release(claim.id).catch(() => undefined)).pipe(switchMap(() => throwError(() => err))),
          ),
        );
      }),
    );
  }

  /** The key this request should be settled under, or nothing (leave it alone). */
  private usableKey(request: Request & { user?: { sub?: string } }): string | null {
    if (request.method !== 'POST') return null;
    const header = request.headers['idempotency-key'];
    const key = (Array.isArray(header) ? header[0] : header)?.trim();
    if (!key) return null;
    if (key.length > 200) throw new BadRequestException('Idempotency-Key must be at most 200 characters');
    // Needs a caller to own the key, and a body we can compare.
    if (!request.user?.sub) return null;
    // A route that only *recognises* a caller (@PublicWithOptionalUser) keeps an
    // anonymous database scope, and an owner-scoped row cannot be written there.
    const scope = currentDbContext()?.scope;
    if (scope !== 'tenant' && scope !== 'platform') return null;
    if (String(request.headers['content-type'] ?? '').includes('multipart/form-data')) return null;
    return isExemptPath(routePath(request.originalUrl ?? request.url)) ? null : key;
  }

  /**
   * Win the key (and run the handler), or find the winner's answer.
   * Throws 409 when the key was used for a different request, or when the first
   * request is still running after WAIT_FOR_WINNER_MS.
   */
  private async claim(
    request: Request & { user?: { sub?: string } },
    key: string,
  ): Promise<{ id: string; replayed: boolean; response?: unknown }> {
    const userId = request.user!.sub!;
    const path = routePath(request.originalUrl ?? request.url);
    const requestHash = bodyFingerprint(request.body);
    const deadline = Date.now() + WAIT_FOR_WINNER_MS;

    for (;;) {
      // `DO NOTHING` rather than catching a unique violation: losing the race is
      // the ordinary case here, and it should not read as a database error in the
      // logs of every duplicate submission.
      const [claimed] = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO core.idempotency_keys (user_id, key, method, path, request_hash, expires_at)
        VALUES (${userId}::uuid, ${key}, ${request.method}, ${path.slice(0, 500)}, ${requestHash},
                ${new Date(Date.now() + IDEMPOTENCY_RETENTION_MS)})
        ON CONFLICT (user_id, key) DO NOTHING
        RETURNING id`;
      if (claimed) {
        if (Math.random() < SWEEP_PROBABILITY) await this.sweep(userId);
        return { id: claimed.id, replayed: false };
      }

      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId, key } },
        select: { id: true, method: true, path: true, requestHash: true, response: true, completedAt: true, expiresAt: true },
      });
      // Gone, or long past its window: claim it afresh.
      if (!existing) continue;
      if (existing.expiresAt.getTime() <= Date.now()) {
        await this.prisma.idempotencyKey.deleteMany({ where: { id: existing.id } });
        continue;
      }
      if (existing.method !== request.method || existing.path !== path || existing.requestHash !== requestHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'This Idempotency-Key was already used for a different request. Use a new key.',
        });
      }
      if (existing.completedAt) return { id: existing.id, replayed: true, response: existing.response };
      if (Date.now() >= deadline) {
        throw new ConflictException({
          code: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
          message: 'An identical request is still being processed. Try again in a moment.',
        });
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  private async complete(id: string, statusCode: number, payload: unknown) {
    await this.prisma.idempotencyKey.updateMany({
      where: { id },
      // Express has not applied the route's status yet when an interceptor sees the
      // payload; 201 is what Nest sends for a POST unless the route says otherwise.
      data: { statusCode: statusCode && statusCode !== 200 ? statusCode : 201, response: asStoredJson(payload), completedAt: new Date() },
    });
  }

  private async release(id: string) {
    await this.prisma.idempotencyKey.deleteMany({ where: { id } });
  }

  /** The caller's own expired keys (Row-Level Security allows no others). */
  private async sweep(userId: string) {
    try {
      await this.prisma.idempotencyKey.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
    } catch (err) {
      this.logger.warn(`Sweeping expired idempotency keys failed: ${(err as Error).message}`);
    }
  }
}
