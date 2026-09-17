import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Identifies this web tier to the API on same-origin proxied calls.
 *
 * Browsers never talk to the API directly — they call `/proxy-api/*` on the web
 * origin and Next forwards it server-side. From the API's point of view every
 * request then arrives from the hosting platform's egress IP, so without a
 * forwarded client address the entire user base shares one rate-limit bucket
 * and per-IP lockout stops meaning anything.
 *
 * `rewrites()` in next.config cannot add request headers, which is why this has
 * to be middleware.
 *
 * Where the trust comes from, precisely:
 *
 *  - The API ignores the forwarded address unless `X-UC-Proxy-Secret` matches
 *    its own `PROXY_SHARED_SECRET` (platform/api/src/bootstrap/client-ip.ts).
 *    That stops anything which reaches the API without going through this web
 *    tier from injecting an address.
 *  - The address itself must come from the platform, never from the request
 *    body of headers a browser controls. `request.ip` is populated by the host
 *    (on Vercel, from its edge) and is the only fully trustworthy source here.
 *    `x-vercel-forwarded-for` is overwritten by Vercel's edge on every inbound
 *    request, so a client copy cannot survive to this point in that deployment.
 *  - The `x-forwarded-for` fallback is for local development and any host that
 *    populates neither of the above. It is NOT spoof-proof: a deployment that
 *    does not sit behind a proxy which overwrites that header would let a
 *    client choose its own rate-limit bucket. Vercel and the Caddy front end in
 *    infrastructure/kvm both overwrite it.
 *
 * Headers a client supplied are dropped before anything is set, so a browser
 * can never present its own secret.
 *
 * With no secret configured (plain local development) this is a no-op and the
 * API falls back to the socket address.
 */
const PROXY_SECRET_HEADER = 'x-uc-proxy-secret';
const CLIENT_IP_HEADER = (process.env.CLIENT_IP_HEADER ?? 'x-vercel-forwarded-for').toLowerCase();

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);

  // Never let a caller supply either of these itself.
  headers.delete(PROXY_SECRET_HEADER);
  headers.delete(CLIENT_IP_HEADER);

  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret) {
    const platformIp = request.ip;
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const clientIp = platformIp || forwarded;
    if (clientIp) {
      headers.set(PROXY_SECRET_HEADER, secret);
      headers.set(CLIENT_IP_HEADER, clientIp);
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/proxy-api/:path*'],
};
