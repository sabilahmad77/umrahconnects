/**
 * The `Idempotency-Key` the shared API client sends on creates (N-FORM-1).
 *
 * `lib/single-flight.ts` joins identical writes that overlap in ONE tab, and that
 * is where its protection stops: a second tab, a retry after a token refresh or a
 * flaky connection each send their own request, and A12 got five pilgrims from
 * five identical submissions — two of them from two real browser tabs signed in
 * as the same operator.
 *
 * So every create now carries a key the SERVER settles
 * (platform/api/src/common/idempotency/idempotency.interceptor.ts): the first
 * request creates the record, and any duplicate carrying the same key gets that
 * first response back instead of creating a second one.
 *
 * The key identifies one SUBMIT ATTEMPT, not one tab and not one keystroke:
 *
 *  - it is derived from the method, the URL and the exact body, so a changed form
 *    is a different attempt (and the server refuses a reused key with a changed
 *    body outright);
 *  - it is remembered in `localStorage`, which every tab of the origin shares, so
 *    two tabs submitting the same form are the same attempt;
 *  - it is forgotten after WINDOW_MS, so deliberately doing the same thing again
 *    a minute later — posting the same message, adding a second identical room —
 *    is a new attempt and really does create a second record.
 */

/** How long one submit attempt stays joinable across tabs. */
const WINDOW_MS = 30_000;
const PREFIX = 'uc:idem:';
/** Bodies longer than this are not worth a localStorage entry; the key is per-call. */
const MAX_SLOT_LENGTH = 4_000;

/** Paths that settle duplicates themselves — money and sessions (the API agrees). */
const EXEMPT = [/^\/auth(\/|$)/, /^\/payments(\/|$)/, /^\/finance\/invoices\/[^/]+\/payments$/, /^\/finance\/payments\/[^/]+\/refund$/];

/** Same-tab fallback when localStorage is unavailable (private mode, blocked site data). */
const memory = new Map<string, { id: string; at: number }>();

function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for contexts without randomUUID: still 122 bits of randomness.
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The request body as a comparable string, or `null` when it cannot be compared. */
function bodyText(data: unknown): string | null {
  if (data === undefined || data === null) return '';
  if (typeof data === 'string') return data;
  if (typeof FormData !== 'undefined' && data instanceof FormData) return null;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return null;
  if (typeof data !== 'object') return String(data);
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

function pathOf(url: string): string {
  const path = (url || '/').split('?')[0];
  return (path.startsWith('http') ? new URL(path).pathname : path).replace(/^\/proxy-api/, '').replace(/^\/api\/v\d+/, '') || '/';
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Drops entries of attempts that are over, so the shared slot list stays short. */
function prune(ls: Storage, now: number) {
  for (let i = ls.length - 1; i >= 0; i -= 1) {
    const name = ls.key(i);
    if (!name?.startsWith(PREFIX)) continue;
    try {
      const at = Number(JSON.parse(ls.getItem(name) ?? '{}').at);
      if (!at || now - at > WINDOW_MS) ls.removeItem(name);
    } catch {
      ls.removeItem(name);
    }
  }
}

/**
 * The key for this write, or `undefined` when the request should carry none
 * (not a create, a body that cannot be compared, or a path with its own rules).
 */
export function idempotencyKeyFor(method: string, url: string, data?: unknown): string | undefined {
  if (method.toUpperCase() !== 'POST') return undefined;
  const path = pathOf(url);
  if (EXEMPT.some((rule) => rule.test(path))) return undefined;
  const body = bodyText(data);
  if (body === null) return undefined;

  const now = Date.now();
  const slot = `${PREFIX}${path} ${body}`;
  if (slot.length > MAX_SLOT_LENGTH) return uuid();

  const ls = store();
  if (!ls) {
    const held = memory.get(slot);
    if (held && now - held.at <= WINDOW_MS) return held.id;
    const id = uuid();
    memory.set(slot, { id, at: now });
    return id;
  }
  try {
    prune(ls, now);
    const raw = ls.getItem(slot);
    if (raw) {
      const held = JSON.parse(raw) as { id?: string; at?: number };
      if (held.id && held.at && now - held.at <= WINDOW_MS) return held.id;
    }
    const id = uuid();
    ls.setItem(slot, JSON.stringify({ id, at: now }));
    return id;
  } catch {
    return uuid();
  }
}
