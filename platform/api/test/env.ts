// Loaded before every e2e file, before the app module is imported.
import { inject } from 'vitest';
import { resolveAppDatabaseUrl, resolveTestDatabaseUrl } from './db-url';

process.env.NODE_ENV = 'test';
// The API connects as the runtime role (RLS applies); fixtures use the owner URL.
process.env.DATABASE_URL = resolveAppDatabaseUrl();
process.env.TEST_OWNER_DATABASE_URL = resolveTestDatabaseUrl();
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.JWT_EXPIRES_IN = '15m';
process.env.WEB_URL = 'http://web.test';
process.env.CORS_ORIGINS = 'http://web.test';
process.env.MAIL_DRIVER = 'log';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.SANDBOX_WEBHOOK_SECRET = 'test-sandbox-webhook-secret';
process.env.STORAGE_DRIVER = 'local';
// This run's own directory (test/global-setup.ts, removed after the run) — never the worktree's uploads/.
process.env.STORAGE_LOCAL_DIR = inject('e2eStorageDir');
process.env.KAFKA_ENABLED = 'false';
process.env.THROTTLE_DISABLED = process.env.THROTTLE_DISABLED ?? 'true';
// Pinned so the suite does not inherit a developer's .env. The API supports both
// refresh paths: the httpOnly cookie (what the web client now uses, covered by
// "accepts the refresh token from the httpOnly cookie") and the response body,
// which stays available for non-browser clients during the migration and is what
// the rotation/replay test drives. Deployments set this to 'false'.
process.env.AUTH_REFRESH_TOKEN_IN_BODY = 'true';
process.env.SWAGGER_ENABLED = 'false';
process.env.ONBOARDING_REQUIRE_VERIFIED_EMAIL = 'true';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GOOGLE_REDIRECT_URI;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
