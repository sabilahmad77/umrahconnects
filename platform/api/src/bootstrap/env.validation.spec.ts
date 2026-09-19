import { describe, expect, it } from 'vitest';
import { assertProductionConfig, productionConfigProblems } from './env.validation';

/** A production configuration that passes every rule (values are test fixtures, not secrets). */
const safe = (): Record<string, string | undefined> => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://umrah:fixture-password@uc-postgres:5432/umrah_connects?schema=public',
  JWT_SECRET: 'f'.repeat(64),
  WEB_URL: 'https://umrahconnect.io',
  CORS_ORIGINS: 'https://umrahconnect.io,https://www.umrahconnect.io',
  PUBLIC_API_BASE_URL: 'https://umrahconnect.io/proxy-api',
  PAYMENT_PROVIDER: 'none',
  STORAGE_DRIVER: 'r2',
  S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  S3_BUCKET: 'documents',
  S3_ACCESS_KEY_ID: 'fixture-key-id',
  S3_SECRET_ACCESS_KEY: 'fixture-secret',
  MAIL_DRIVER: 'none',
});

describe('production configuration check', () => {
  it('accepts a complete KVM configuration', () => {
    expect(productionConfigProblems(safe())).toEqual([]);
    expect(() => assertProductionConfig(safe())).not.toThrow();
  });

  it('does not apply outside production', () => {
    expect(productionConfigProblems({ NODE_ENV: 'development', WEB_URL: 'https://umrah-connect-api.onrender.com' })).toEqual([]);
  });

  it('keeps the existing rules (required secrets, https, no wildcard CORS, no sandbox payments)', () => {
    const problems = productionConfigProblems({
      ...safe(),
      JWT_SECRET: undefined,
      WEB_URL: 'http://localhost:3000',
      CORS_ORIGINS: '*',
      PAYMENT_PROVIDER: 'sandbox',
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        'JWT_SECRET is required',
        'WEB_URL must be an https:// URL',
        'CORS_ORIGINS must not contain "*"',
        'PAYMENT_PROVIDER=sandbox is not allowed in production',
      ]),
    );
  });

  describe('Render is retired', () => {
    it.each([
      ['WEB_URL', 'https://umrah-connect-api.onrender.com'],
      ['APP_URL', 'https://umrah-connect.onrender.com'],
      ['PUBLIC_API_BASE_URL', 'https://umrah-connect-api.onrender.com/api/v1'],
      ['CORS_ORIGINS', 'https://umrahconnect.io,https://umrah-connect.onrender.com'],
      ['CORS_ORIGIN_REGEX', '^https://[a-z0-9-]+\\.onrender\\.com$'],
      ['GOOGLE_REDIRECT_URI', 'https://umrah-connect-api.ONRENDER.com/api/v1/auth/google/callback'],
      ['S3_PUBLIC_BASE_URL', 'https://media.onrender.com'],
    ])('refuses %s on a Render host', (key, value) => {
      const env = { ...safe(), [key]: value };
      if (key === 'GOOGLE_REDIRECT_URI') Object.assign(env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });
      expect(productionConfigProblems(env)).toContain(`${key} points at a Render host (onrender.com); Render is retired`);
    });

    it.each([
      'postgresql://u:p@dpg-d94o1dtckfvc73abpon0-a.oregon-postgres.render.com/umrah',
      'postgresql://u:p@dpg-d94o1dtckfvc73abpon0-a.oregon-postgres.render.com:5432/umrah?sslmode=require',
      'postgres://user:pa/ss@RENDER.COM/db',
    ])('refuses a Render-hosted DATABASE_URL (%#)', (url) => {
      expect(productionConfigProblems({ ...safe(), DATABASE_URL: url })).toContain(
        'DATABASE_URL points at a Render-hosted database (render.com); restore the data into the KVM database instead',
      );
    });

    it.each([
      'postgresql://umrah:secret@uc-postgres:5432/umrah_connects?schema=public',
      'postgresql://umrah:secret@db.example.org/umrah?options=render.com',
      'postgresql://umrah:x@notrender.com/db',
    ])('accepts a non-Render DATABASE_URL (%#)', (url) => {
      expect(productionConfigProblems({ ...safe(), DATABASE_URL: url })).toEqual([]);
    });
  });

  describe('GOOGLE_OIDC_STUB_URL (test-only stub)', () => {
    it('is refused in production', () => {
      expect(productionConfigProblems({ ...safe(), GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4999' })).toContain(
        'GOOGLE_OIDC_STUB_URL is a test-only setting and must not be set in production',
      );
    });

    it('is ignored when empty, and allowed outside production', () => {
      expect(productionConfigProblems({ ...safe(), GOOGLE_OIDC_STUB_URL: '  ' })).toEqual([]);
      expect(productionConfigProblems({ NODE_ENV: 'test', GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4999' })).toEqual([]);
    });
  });

  it('reports variable names only, never values', () => {
    const secret = 'postgresql://u:VerySecretPassword123@dpg-x-a.oregon-postgres.render.com/db';
    const message = (() => {
      try {
        assertProductionConfig({ ...safe(), DATABASE_URL: secret, JWT_SECRET: 'short-but-secret' });
      } catch (err) {
        return (err as Error).message;
      }
      return '';
    })();
    expect(message).toContain('DATABASE_URL points at a Render-hosted database');
    expect(message).toContain('JWT_SECRET must be at least 32 characters');
    expect(message).not.toContain('VerySecretPassword123');
    expect(message).not.toContain('short-but-secret');
  });
});
