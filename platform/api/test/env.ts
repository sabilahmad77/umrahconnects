// Loaded before every e2e file, before the app module is imported.
import { resolveTestDatabaseUrl } from './db-url';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.JWT_EXPIRES_IN = '15m';
process.env.WEB_URL = 'http://web.test';
process.env.CORS_ORIGINS = 'http://web.test';
process.env.MAIL_DRIVER = 'log';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.SANDBOX_WEBHOOK_SECRET = 'test-sandbox-webhook-secret';
process.env.STORAGE_DRIVER = 'local';
process.env.KAFKA_ENABLED = 'false';
process.env.THROTTLE_DISABLED = process.env.THROTTLE_DISABLED ?? 'true';
process.env.SWAGGER_ENABLED = 'false';
process.env.ONBOARDING_REQUIRE_VERIFIED_EMAIL = 'true';
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.GOOGLE_REDIRECT_URI;
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
