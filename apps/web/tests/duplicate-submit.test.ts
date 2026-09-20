import { describe, expect, it, vi } from 'vitest';
import { pendingWrites, singleFlight, writeKey } from '../lib/single-flight';

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
