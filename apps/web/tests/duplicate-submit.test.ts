import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingWrites, singleFlight, writeKey } from '../lib/single-flight';
import { idempotencyKeyFor } from '../lib/idempotency-key';

/**
 * N-FORM-1 — duplicate-submission protection. A double click used to create two
 * pilgrims, two vehicles, two posts…; identical writes that overlap in time are
 * now joined into one request, while a deliberate repeat after the first one
 * finished still goes through.
 */
describe('duplicate submits are joined, repeats are not (N-FORM-1)', () => {
  const later = <T>(value: T, ms = 20) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

  it('two identical writes in flight become one request', async () => {
    const send = vi.fn(() => later({ id: 'created' }));
    const key = writeKey('post', '/pilgrims', { firstNameEn: 'Sara' });
    const [a, b] = await Promise.all([singleFlight(key, send), singleFlight(key, send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(pendingWrites()).toBe(0);
  });

  it('a repeat after the first one finished is a new request', async () => {
    const send = vi.fn(() => later({ id: 'created' }));
    const key = writeKey('post', '/social/posts', { content: 'Alhamdulillah' });
    await singleFlight(key, send);
    await singleFlight(key, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('different writes are never joined, and a failure releases the key', async () => {
    const send = vi.fn(() => later('ok'));
    await Promise.all([
      singleFlight(writeKey('post', '/transport/vehicles', { plateNumber: 'A-1' }), send),
      singleFlight(writeKey('post', '/transport/vehicles', { plateNumber: 'A-2' }), send),
      singleFlight(writeKey('put', '/transport/vehicles', { plateNumber: 'A-1' }), send),
      singleFlight(writeKey('post', '/transport/routes', { plateNumber: 'A-1' }), send),
    ]);
    expect(send).toHaveBeenCalledTimes(4);

    const failing = vi.fn(() => Promise.reject(new Error('network')));
    const key = writeKey('post', '/hotels', { name: 'Qasr' });
    await expect(singleFlight(key, failing)).rejects.toThrow('network');
    await expect(singleFlight(key, failing)).rejects.toThrow('network');
    expect(failing).toHaveBeenCalledTimes(2);
    expect(pendingWrites()).toBe(0);
  });

  it('uploads and unserializable bodies always send', async () => {
    expect(writeKey('post', '/uploads', new FormData())).toBeNull();
    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(writeKey('post', '/x', cyclic)).toBeNull();
    const send = vi.fn(() => later('ok'));
    await Promise.all([singleFlight(null, send), singleFlight(null, send)]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

/**
 * The second layer: the key the server settles. It identifies one SUBMIT
 * ATTEMPT — shared by every tab of this account, kept across the retry that
 * follows a token refresh, and released once the attempt is over so a deliberate
 * repeat still creates a second record.
 *
 * These tests run in Node (the suite has no DOM), so the shared per-origin store
 * two tabs would use is stood up here with the same contract a browser gives it.
 */
function memoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
}

describe('the Idempotency-Key the server settles (N-FORM-1)', () => {
  beforeEach(() => {
    // One store, shared by every "tab" in this test — exactly what localStorage is.
    (globalThis as any).localStorage = memoryStorage();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).localStorage;
  });

  it('two tabs submitting the same form send the same key', () => {
    const tabA = idempotencyKeyFor('post', '/pilgrims', { firstName: 'Sara', passportNumber: 'A1' });
    const tabB = idempotencyKeyFor('post', '/pilgrims', { firstName: 'Sara', passportNumber: 'A1' });
    expect(tabA).toBe(tabB);
    expect(tabA).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('a different form, a different route or a different method is a different attempt', () => {
    const base = idempotencyKeyFor('post', '/pilgrims', { firstName: 'Sara' });
    expect(idempotencyKeyFor('post', '/pilgrims', { firstName: 'Omar' })).not.toBe(base);
    expect(idempotencyKeyFor('post', '/hotels', { firstName: 'Sara' })).not.toBe(base);
    // Only creates carry a key; an update addresses a record that already exists.
    expect(idempotencyKeyFor('put', '/pilgrims', { firstName: 'Sara' })).toBeUndefined();
  });

  it('a deliberate repeat once the attempt is over is a new attempt', () => {
    vi.useFakeTimers();
    const first = idempotencyKeyFor('post', '/social/posts', { content: 'Alhamdulillah' });
    expect(idempotencyKeyFor('post', '/social/posts', { content: 'Alhamdulillah' })).toBe(first);
    vi.advanceTimersByTime(31_000);
    expect(idempotencyKeyFor('post', '/social/posts', { content: 'Alhamdulillah' })).not.toBe(first);
  });

  it('money and sessions keep their own rules; uploads carry no key', () => {
    for (const path of ['/auth/login', '/payments/intents', '/finance/invoices/abc/payments', '/finance/payments/abc/refund']) {
      expect(idempotencyKeyFor('post', path, { a: 1 }), path).toBeUndefined();
    }
    expect(idempotencyKeyFor('post', '/uploads', new FormData())).toBeUndefined();
  });

  it('the proxy prefix and the query string do not make two tabs disagree', () => {
    const direct = idempotencyKeyFor('post', '/pilgrims', { firstName: 'Zayd' });
    expect(idempotencyKeyFor('post', '/proxy-api/pilgrims', { firstName: 'Zayd' })).toBe(direct);
    expect(idempotencyKeyFor('post', '/pilgrims?draft=1', { firstName: 'Zayd' })).toBe(direct);
  });

  it('a blocked store still yields a key (it just cannot be shared between tabs)', () => {
    (globalThis as any).localStorage = {
      get length() {
        throw new Error('site data blocked');
      },
      key: () => null,
      getItem: () => {
        throw new Error('site data blocked');
      },
      setItem: () => {
        throw new Error('site data blocked');
      },
      removeItem: () => undefined,
      clear: () => undefined,
    };
    expect(idempotencyKeyFor('post', '/hotels', { name: 'Qasr' })).toMatch(/^[0-9a-f-]{36}$/);
  });
});
