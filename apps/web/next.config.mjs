// Backend origin for the same-origin /proxy-api rewrite.
//
// In production this MUST be configured explicitly. It used to fall back to a
// hard-coded Render host that has been dead since the platform moved; with the
// variable unset on Vercel every API call went to that host, hung, and failed
// without telling anyone. A missing origin is now a build failure instead.
const IS_PRODUCTION = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';
const API_ORIGIN = process.env.API_PROXY_ORIGIN ?? (IS_PRODUCTION ? undefined : 'http://localhost:4000');

if (!API_ORIGIN) {
  throw new Error(
    'API_PROXY_ORIGIN is required for a production build. Set it to the API origin ' +
      '(for example https://api.umrahconnect.io) in the deployment environment.',
  );
}

/**
 * Hosts allowed to serve remote images.
 *
 * With STORAGE_DRIVER=r2 the API returns absolute public-media URLs on the host
 * of S3_PUBLIC_BASE_URL, and next/image rejects any host not listed here.
 */
const mediaHost = (() => {
  const raw = process.env.S3_PUBLIC_MEDIA_HOST ?? process.env.S3_PUBLIC_BASE_URL;
  if (!raw) return undefined;
  try {
    return raw.includes('://') ? new URL(raw).hostname : raw;
  } catch {
    return undefined;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Same-origin proxy: the browser calls the web origin and Next forwards to the
  // API server-side, so there is no cross-origin cookie or CORS problem and the
  // API host can change without a client rebuild.
  async rewrites() {
    return [
      { source: '/proxy-api/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
  images: {
    remotePatterns: [
      // The production domain is umrahconnect.io (singular). The previous
      // `umrahconnects.io` entries matched nothing that is actually served.
      { protocol: 'https', hostname: 'umrahconnect.io' },
      { protocol: 'https', hostname: '**.umrahconnect.io' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
      ...(mediaHost ? [{ protocol: 'https', hostname: mediaHost }] : []),
      // Development hosts only — MinIO and a locally served API.
      ...(IS_PRODUCTION
        ? []
        : [
            { protocol: 'http', hostname: 'localhost' },
            { protocol: 'http', hostname: 'minio' },
          ]),
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // A reset or verification token travels in the query string; do not leak
        // it to anything these pages link out to.
        source: '/(reset-password|verify-email)',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
