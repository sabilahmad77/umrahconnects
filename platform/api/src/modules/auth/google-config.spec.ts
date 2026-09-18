import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { GoogleAuthService, googleStubIssuer } from './google.service';
import { productionConfigProblems } from '../../bootstrap/env.validation';

// A plain lookup, not ConfigService: ConfigService lets process.env (NODE_ENV=test under vitest) win.
const service = (env: Record<string, string>) =>
  new GoogleAuthService({ get: (key: string) => env[key] } as unknown as ConfigService, {} as never, {} as never, {} as never, {} as never, {} as never);

describe('Google Sign-In configuration', () => {
  describe('local OIDC stub (development and tests only)', () => {
    it('is used for a bare loopback http origin outside production', () => {
      expect(googleStubIssuer({ NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4482' })).toBe('http://127.0.0.1:4482');
      expect(googleStubIssuer({ NODE_ENV: 'test', GOOGLE_OIDC_STUB_URL: 'http://localhost:4482/' })).toBe('http://localhost:4482');
    });

    it.each([
      ['production', { NODE_ENV: 'production', GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4482' }],
      ['a remote host', { NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'http://stub.example.test:4482' }],
      ['https to a remote host', { NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'https://accounts.evil.test' }],
      ['a path', { NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4482/oauth' }],
      ['credentials in the URL', { NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'http://user@127.0.0.1:4482' }],
      ['not a URL', { NODE_ENV: 'development', GOOGLE_OIDC_STUB_URL: 'localhost' }],
    ])('is ignored for %s', (_label, env) => {
      expect(googleStubIssuer(env)).toBeUndefined();
    });

    it('production always talks to Google, whatever GOOGLE_OIDC_STUB_URL says', () => {
      const google = service({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'secret',
        GOOGLE_REDIRECT_URI: 'https://umrahconnect.io/proxy-api/auth/google/callback',
        GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4482',
      });
      expect(google.mode).toBe('google');
      expect(google.clientOptions().endpoints).toBeUndefined();
      expect(google.clientOptions().issuers).toBeUndefined();
    });

    it('in development only the endpoints and the expected issuer change', () => {
      const google = service({
        NODE_ENV: 'development',
        GOOGLE_CLIENT_ID: 'stub-client',
        GOOGLE_CLIENT_SECRET: 'stub-secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:3402/proxy-api/auth/google/callback',
        GOOGLE_OIDC_STUB_URL: 'http://127.0.0.1:4482',
      });
      expect(google.mode).toBe('local-stub');
      expect(google.clientOptions()).toEqual({
        clientId: 'stub-client',
        clientSecret: 'stub-secret',
        redirectUri: 'http://localhost:3402/proxy-api/auth/google/callback',
        endpoints: {
          oauth2AuthBaseUrl: 'http://127.0.0.1:4482/o/oauth2/v2/auth',
          oauth2TokenUrl: 'http://127.0.0.1:4482/token',
          oauth2FederatedSignonPemCertsUrl: 'http://127.0.0.1:4482/oauth2/v1/certs',
          oauth2FederatedSignonJwkCertsUrl: 'http://127.0.0.1:4482/oauth2/v3/certs',
        },
        issuers: ['http://127.0.0.1:4482'],
      });
    });
  });

  describe('GOOGLE_REDIRECT_URI scheme (bootstrap/env.validation)', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://db/app',
      JWT_SECRET: 'x'.repeat(40),
      WEB_URL: 'https://umrahconnect.io',
      CORS_ORIGINS: 'https://umrahconnect.io',
      STORAGE_DRIVER: 'r2',
      S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's', S3_ENDPOINT: 'https://r2.example.test',
      GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
    };

    it('allows http://localhost outside production (local development)', () => {
      expect(productionConfigProblems({ NODE_ENV: 'development', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REDIRECT_URI: 'http://localhost:3402/proxy-api/auth/google/callback' })).toEqual([]);
    });

    it('keeps https mandatory in production', () => {
      expect(productionConfigProblems({ ...production, GOOGLE_REDIRECT_URI: 'http://localhost:3402/proxy-api/auth/google/callback' }))
        .toContain('GOOGLE_REDIRECT_URI must be https');
      expect(productionConfigProblems({ ...production, GOOGLE_REDIRECT_URI: 'https://umrahconnect.io/proxy-api/auth/google/callback' })).toEqual([]);
    });
  });
});
