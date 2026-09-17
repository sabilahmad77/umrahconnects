import { describe, expect, it } from 'vitest';
import { makeClientIpResolver } from './client-ip';

describe('client IP resolution', () => {
  const resolve = makeClientIpResolver({ PROXY_SHARED_SECRET: 's3cret-value', CLIENT_IP_HEADER: 'x-vercel-forwarded-for' });

  it('uses the proxy header only with the shared secret', () => {
    expect(resolve({ ip: '76.76.21.1', headers: { 'x-uc-proxy-secret': 's3cret-value', 'x-vercel-forwarded-for': '203.0.113.9' } })).toBe('203.0.113.9');
    expect(resolve({ ip: '76.76.21.1', headers: { 'x-vercel-forwarded-for': '203.0.113.9' } })).toBe('76.76.21.1');
    expect(resolve({ ip: '76.76.21.1', headers: { 'x-uc-proxy-secret': 'wrong-secret', 'x-vercel-forwarded-for': '203.0.113.9' } })).toBe('76.76.21.1');
  });

  it('rejects malformed header values', () => {
    expect(resolve({ ip: '10.0.0.1', headers: { 'x-uc-proxy-secret': 's3cret-value', 'x-vercel-forwarded-for': '<script>' } })).toBe('10.0.0.1');
  });

  it('ignores the header entirely when no secret is configured', () => {
    const open = makeClientIpResolver({});
    expect(open({ ip: '10.0.0.2', headers: { 'x-uc-proxy-secret': '', 'x-vercel-forwarded-for': '203.0.113.9' } })).toBe('10.0.0.2');
  });
});
