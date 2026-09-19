/**
 * Fail-fast production configuration check. Runs before Nest boots so an unsafe
 * deployment never starts serving traffic. Reports variable NAMES only.
 */
export function productionConfigProblems(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const need = (k: string) => {
    if (!env[k]?.trim()) problems.push(`${k} is required`);
  };

  ['DATABASE_URL', 'JWT_SECRET', 'WEB_URL', 'CORS_ORIGINS'].forEach(need);

  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (env.WEB_URL && !env.WEB_URL.startsWith('https://')) problems.push('WEB_URL must be an https:// URL');
  if ((env.CORS_ORIGINS ?? '').split(',').some((o) => o.trim() === '*')) problems.push('CORS_ORIGINS must not contain "*"');

  const payment = env.PAYMENT_PROVIDER ?? 'none';
  if (payment === 'sandbox') problems.push('PAYMENT_PROVIDER=sandbox is not allowed in production');
  if (payment === 'stripe') ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].forEach(need);

  const storage = env.STORAGE_DRIVER ?? 'local';
  if (storage === 'local' && env.STORAGE_LOCAL_PERSISTENT !== 'true') {
    problems.push('STORAGE_DRIVER=local requires STORAGE_LOCAL_PERSISTENT=true (a persistent volume) in production');
  }
  if (storage === 'r2' || storage === 's3') {
    ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].forEach(need);
    if (storage === 'r2') need('S3_ENDPOINT');
  }

  if (env.MAIL_DRIVER === 'smtp') ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'].forEach(need);
  if (env.MAIL_DRIVER === 'log') problems.push('MAIL_DRIVER=log is not allowed in production');

  const google = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'].filter((k) => env[k]);
  if (google.length && google.length < 3) problems.push('Google Sign-In needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI together');
  if (env.GOOGLE_REDIRECT_URI && !env.GOOGLE_REDIRECT_URI.startsWith('https://')) problems.push('GOOGLE_REDIRECT_URI must be https');

  if (env.KAFKA_ENABLED === 'true' && !env.KAFKA_BROKERS) problems.push('KAFKA_BROKERS is required when KAFKA_ENABLED=true');

  // Test-only Google OIDC stub. The Google service already ignores it in production; refusing to boot
  // makes a leaked test setting visible instead of silently inert.
  if (env.GOOGLE_OIDC_STUB_URL?.trim()) problems.push('GOOGLE_OIDC_STUB_URL is a test-only setting and must not be set in production');

  // Render is retired (docs/control-tower/RENDER_RETIREMENT.md). A value copied from the old Render
  // dashboard would send links, CORS trust or the database connection to a dead or legacy host.
  RENDER_URL_SETTINGS.forEach((k) => {
    if (env[k] && /onrender/i.test(env[k] as string)) problems.push(`${k} points at a Render host (onrender.com); Render is retired`);
  });
  if (env.DATABASE_URL && isRenderDatabaseHost(env.DATABASE_URL)) {
    problems.push('DATABASE_URL points at a Render-hosted database (render.com); restore the data into the KVM database instead');
  }
  return problems;
}

/** URL-valued settings that must never name a Render host in production. */
const RENDER_URL_SETTINGS = [
  'WEB_URL',
  'APP_URL',
  'PUBLIC_API_BASE_URL',
  'CORS_ORIGINS',
  'CORS_ORIGIN_REGEX',
  'GOOGLE_REDIRECT_URI',
  'S3_PUBLIC_BASE_URL',
] as const;

/** True when the connection string's host is a Render database host (e.g. dpg-…-a.oregon-postgres.render.com). */
function isRenderDatabaseHost(url: string): boolean {
  // Parsed by hand: a password may contain characters that make `new URL` throw. The host follows the
  // last "@" of the part before the query string (credentials end there even if they contain "/").
  const beforeQuery = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[?#]/, 1)[0] ?? '';
  const host = beforeQuery.slice(beforeQuery.lastIndexOf('@') + 1).split(/[/:]/, 1)[0] ?? '';
  return /(^|\.)render\.com$/i.test(host);
}

export function assertProductionConfig(env: Record<string, string | undefined>) {
  const problems = productionConfigProblems(env);
  if (problems.length) {
    throw new Error(`Refusing to start with unsafe production configuration:\n  - ${problems.join('\n  - ')}`);
  }
}
