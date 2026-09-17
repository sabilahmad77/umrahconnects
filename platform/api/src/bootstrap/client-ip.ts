import { timingSafeEqual } from 'crypto';

/**
 * Resolves the real client IP.
 *
 * Browsers reach the API through the web app's same-origin rewrite, so the TCP
 * peer (and X-Forwarded-For after TRUST_PROXY) is the web platform's egress IP,
 * shared by many users. When the web tier adds `X-UC-Proxy-Secret` (equal to
 * PROXY_SHARED_SECRET) and the client IP header (CLIENT_IP_HEADER, e.g.
 * `x-vercel-forwarded-for`), that header is trusted. Without the secret the
 * header is ignored, so it cannot be spoofed by callers.
 */
export function makeClientIpResolver(env: { PROXY_SHARED_SECRET?: string; CLIENT_IP_HEADER?: string }) {
  const secret = env.PROXY_SHARED_SECRET ? Buffer.from(env.PROXY_SHARED_SECRET) : undefined;
  const header = (env.CLIENT_IP_HEADER ?? 'x-vercel-forwarded-for').toLowerCase();
  return (req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string => {
    if (secret) {
      const presented = req.headers['x-uc-proxy-secret'];
      const value = Array.isArray(presented) ? presented[0] : presented;
      if (value && value.length === secret.length && timingSafeEqual(Buffer.from(value), secret)) {
        const raw = req.headers[header];
        const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
        if (first && /^[0-9a-fA-F:.]{3,45}$/.test(first)) return first;
      }
    }
    return req.ip ?? 'unknown';
  };
}
