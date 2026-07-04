const API_ORIGIN = process.env.API_PROXY_ORIGIN ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Same-origin proxy: the browser calls the web origin (localhost OR tunnel),
  // and Next forwards to the API server-side. Survives tunnel-URL rotation, works
  // from any device — fixes "Demo login failed" when opened via the shareable URL.
  async rewrites() {
    return [
      { source: '/proxy-api/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      { source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` },
    ];
  },
  images: {
    domains: ['localhost', 'minio', 'umrahconnects.io'],
    remotePatterns: [
      { protocol: 'https', hostname: '**.umrahconnects.io' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
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
    ];
  },
};

export default nextConfig;
