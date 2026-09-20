import { setTimeout as delay } from 'node:timers/promises';

/**
 * Provider integration suites: refuse to "pass" by skipping (A12-6, eng100-fx3).
 *
 * Each suite is `describe.skipIf(!url)`, so without its endpoint variable the file
 * reports zero failures — which is how a rotted contract test (`cancel()` resolving
 * `undefined` after the contract became `CancelResult`) survived inside a documented
 * gate for weeks. A gate that can silently run nothing is not a gate.
 *
 * So when `PROVIDER_TESTS_REQUIRED=true` (the `test:providers` script and CI set it)
 * every endpoint must be configured AND reachable before a single test runs; anything
 * missing fails the run here, with the command that starts the stand-in.
 */

const REQUIRED: { env: string; label: string; probe: (v: string) => string; start: string }[] = [
  {
    env: 'STRIPE_MOCK_URL',
    label: 'stripe-mock',
    probe: (v) => `${v.replace(/\/+$/, '')}/v1/payment_intents/pi_123`,
    start: 'docker run -d --rm --name uc-stripe-mock -p 127.0.0.1:12111:12111 stripe/stripe-mock:latest',
  },
  {
    env: 'S3_TEST_ENDPOINT',
    label: 'MinIO (S3-compatible storage)',
    probe: (v) => `${v.replace(/\/+$/, '')}/minio/health/live`,
    start:
      'docker run -d --rm --name uc-minio -p 127.0.0.1:19000:9000 -e MINIO_ROOT_USER=ucminioadmin ' +
      '-e MINIO_ROOT_PASSWORD=ucminiosecret123 minio/minio:latest server /data',
  },
  {
    env: 'SMTP_TEST_API',
    label: 'Mailpit (SMTP)',
    probe: (v) => `${v.replace(/\/+$/, '')}/api/v1/messages?limit=1`,
    start:
      'docker run -d --rm --name uc-mailpit -p 127.0.0.1:11025:1025 -p 127.0.0.1:18025:8025 ' +
      '-e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 axllent/mailpit:latest',
  },
];

/** stripe-mock answers 401/404 without a key — any HTTP answer means "listening". */
async function reachable(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      await delay(500);
    }
  }
  return false;
}

export default async function setup() {
  if (process.env.PROVIDER_TESTS_REQUIRED !== 'true') return;
  const problems: string[] = [];
  for (const { env, label, probe, start } of REQUIRED) {
    const value = process.env[env];
    if (!value) {
      problems.push(`${env} is not set — ${label} would be skipped.\n    start it with: ${start}`);
      continue;
    }
    if (!(await reachable(probe(value)))) {
      problems.push(`${env}=${value} is not answering — ${label} is not running.\n    start it with: ${start}`);
    }
  }
  if (problems.length) {
    throw new Error(
      `PROVIDER_TESTS_REQUIRED=true but the provider stand-ins are not ready:\n  - ${problems.join('\n  - ')}\n` +
        'See docs/control-tower/LOCAL_TEST_GUIDE.md.',
    );
  }
}
