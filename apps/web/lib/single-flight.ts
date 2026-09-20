/**
 * Duplicate-submission protection (N-FORM-1).
 *
 * A fast double click — or a second render pass — fires the same write twice
 * before the first answer arrives, and two records appear. Buttons do switch to
 * their busy state, but that state only exists after React re-renders, which is
 * one tick too late for a determined double click.
 *
 * So identical writes that OVERLAP IN TIME are joined: the second caller awaits
 * the first request instead of sending its own. Once the first settles the key
 * is released, so a deliberate repeat (sending the same message again, retrying
 * after an error) is a new request. Only the client is being polite here — the
 * server stays authoritative and keeps its own idempotency rules for money.
 */

const inFlight = new Map<string, Promise<unknown>>();

/** A request body that cannot be compared (FormData, Blob, a stream) is never joined. */
function bodyKey(data: unknown): string | null {
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

/** Key for one write: same method, same URL, same body. `null` means "do not join". */
export function writeKey(method: string, url: string, data?: unknown): string | null {
  const body = bodyKey(data);
  return body === null ? null : `${method.toUpperCase()} ${url} ${body}`;
}

/**
 * Run `fn`, or join the identical call that is still running. `key` of `null`
 * always runs (nothing to compare).
 */
export function singleFlight<T>(key: string | null, fn: () => Promise<T>): Promise<T> {
  if (!key) return fn();
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const promise = fn().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Writes waiting for an answer right now (tests and diagnostics). */
export function pendingWrites(): number {
  return inFlight.size;
}
