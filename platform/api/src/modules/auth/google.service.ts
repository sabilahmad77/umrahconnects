import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, CodeChallengeMethod, OAuth2ClientOptions } from 'google-auth-library';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, PURPOSE } from './auth.service';

export const GOOGLE_STATE_COOKIE = 'uc_g_state';

/**
 * Error codes appended to `${WEB_URL}/login?error=` (sign-in) or
 * `${WEB_URL}/settings?linkError=` (linking from account settings).
 * Safe to show: no internals.
 */
export type GoogleErrorCode =
  | 'google_unavailable'
  | 'google_state'
  | 'google_failed'
  | 'google_cancelled'
  | 'google_email_unverified'
  | 'google_account_ambiguous'
  | 'google_privileged_account'
  | 'google_account_disabled'
  | 'google_already_linked';

/** Which screen the person started from, so a failure returns them there. */
export type GoogleFlow = 'sign-in' | 'link';

/**
 * What a successful Google sign-in did to the account, passed to the web in the
 * URL fragment so it can explain it. Absent for an ordinary returning sign-in.
 *  - `created`: a new Traveler account was created from the Google profile.
 *  - `linked`: Google was linked to the existing account with that verified email.
 *  - `linked_password_removed`: as `linked`, and the unverified account's password
 *    was removed (pre-hijack defence), so the person must be told.
 */
export type GoogleOutcome = 'created' | 'linked' | 'linked_password_removed';

export class GoogleSignInError extends Error {
  constructor(
    public readonly code: GoogleErrorCode,
    detail?: string,
    public readonly flow: GoogleFlow = 'sign-in',
  ) {
    super(detail ?? code);
  }
}

interface StatePayload {
  purpose: 'google_oauth_state';
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  linkUserId?: string;
}

export interface GoogleProfile {
  sub: string;
  email?: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  picture?: string;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * The local OpenID provider origin (test/support/google-oidc-stub.mjs) or
 * undefined. Honoured only outside production and only for a bare loopback
 * http origin, so no deployment can be pointed at a foreign token issuer
 * through it.
 */
export function googleStubIssuer(env: { NODE_ENV?: string; GOOGLE_OIDC_STUB_URL?: string }): string | undefined {
  if (env.NODE_ENV === 'production' || !env.GOOGLE_OIDC_STUB_URL) return undefined;
  try {
    const url = new URL(env.GOOGLE_OIDC_STUB_URL);
    const bare = (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash && !url.username;
    if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) && bare) return url.origin;
  } catch {
    // not a URL — ignored below
  }
  return undefined;
}

/** Keeps provider error text useful in logs without ever writing a token into them. */
function logSafe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/[\w-]{8,}\.[\w-]{8,}\.[\w-]*/g, '<jwt>').slice(0, 200);
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Google Sign-In — OpenID Connect authorization-code flow with PKCE, state and
 * nonce. The client secret never leaves the server; the browser only ever
 * receives a 2-minute single-use ticket that it exchanges for a normal session.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  /** Set only in development/test when GOOGLE_OIDC_STUB_URL names a loopback stub. */
  readonly stubIssuer: string | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {
    const env = {
      NODE_ENV: this.config.get<string>('NODE_ENV'),
      GOOGLE_OIDC_STUB_URL: this.config.get<string>('GOOGLE_OIDC_STUB_URL'),
    };
    this.stubIssuer = googleStubIssuer(env);
    if (env.GOOGLE_OIDC_STUB_URL && !this.stubIssuer) {
      this.logger.error('GOOGLE_OIDC_STUB_URL is ignored: it is never used in production and must be a bare loopback http origin');
    } else if (this.stubIssuer) {
      this.logger.warn(`Google Sign-In is using the LOCAL STUB provider at ${this.stubIssuer} — not real Google`);
    }
  }

  get missing(): string[] {
    return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'].filter((k) => !this.config.get(k));
  }

  get configured(): boolean {
    return this.missing.length === 0;
  }

  /** `google` against accounts.google.com, `local-stub` for the development stub. */
  get mode(): 'google' | 'local-stub' {
    return this.stubIssuer ? 'local-stub' : 'google';
  }

  get secureCookies(): boolean {
    return String(this.config.get('GOOGLE_REDIRECT_URI') ?? '').startsWith('https://');
  }

  /** OAuth client settings. For the local stub only the endpoint URLs and the expected issuer change. */
  clientOptions(): OAuth2ClientOptions {
    const options: OAuth2ClientOptions = {
      clientId: this.config.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      redirectUri: this.config.get<string>('GOOGLE_REDIRECT_URI'),
    };
    if (this.stubIssuer) {
      options.endpoints = {
        oauth2AuthBaseUrl: `${this.stubIssuer}/o/oauth2/v2/auth`,
        oauth2TokenUrl: `${this.stubIssuer}/token`,
        oauth2FederatedSignonPemCertsUrl: `${this.stubIssuer}/oauth2/v1/certs`,
        oauth2FederatedSignonJwkCertsUrl: `${this.stubIssuer}/oauth2/v3/certs`,
      };
      options.issuers = [this.stubIssuer];
    }
    return options;
  }

  private client(): OAuth2Client {
    return new OAuth2Client(this.clientOptions());
  }

  /**
   * Only same-site relative paths are accepted as post-login destinations.
   * Anything else yields '' and the web picks the account's own workspace (a
   * fixed '/dashboard' default sent Travelers to an operator page they cannot open).
   */
  static safeReturnTo(value: unknown): string {
    const v = typeof value === 'string' ? value : '';
    return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(v) && v.length <= 200 ? v : '';
  }

  /** Where to send the browser when a flow fails: back to sign-in, or back to account settings when linking. */
  errorUrl(err: unknown): string {
    const known = err instanceof GoogleSignInError ? err : undefined;
    if (!known) this.logger.error(`Google sign-in failed: ${logSafe(err)}`);
    const code: GoogleErrorCode = known?.code ?? 'google_failed';
    return known?.flow === 'link'
      ? `${this.auth.webUrl}/settings?linkError=${code}`
      : `${this.auth.webUrl}/login?error=${code}`;
  }

  /** Builds the Google authorization URL and the signed state cookie value. */
  async start(returnTo: unknown, linkIntent?: string): Promise<{ url: string; stateCookie: string }> {
    const flow: GoogleFlow = linkIntent ? 'link' : 'sign-in';
    if (!this.configured) throw new GoogleSignInError('google_unavailable', undefined, flow);

    let linkUserId: string | undefined;
    if (linkIntent) {
      linkUserId = (await this.auth.consumeOneTimeToken(PURPOSE.OAUTH_LINK, linkIntent)) ?? undefined;
      if (!linkUserId) throw new GoogleSignInError('google_state', 'link intent invalid', 'link');
    }

    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const payload: StatePayload = {
      purpose: 'google_oauth_state',
      state,
      nonce,
      verifier,
      returnTo: GoogleAuthService.safeReturnTo(returnTo),
      linkUserId,
    };
    const stateCookie = await this.jwt.signAsync(payload, { expiresIn: '10m', audience: 'umrah-connects-oauth' });

    const url = this.client().generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      prompt: 'select_account',
      code_challenge: challenge,
      code_challenge_method: CodeChallengeMethod.S256,
      include_granted_scopes: false,
    } as any);
    return { url, stateCookie };
  }

  /** The signed state for this callback, or null when it is missing, forged, expired or belongs to another attempt. */
  private async readState(state: unknown, stateCookie?: string): Promise<StatePayload | null> {
    if (typeof state !== 'string' || !state || !stateCookie) return null;
    try {
      const saved = await this.jwt.verifyAsync<StatePayload>(stateCookie, { audience: 'umrah-connects-oauth' });
      const matches = saved.purpose === 'google_oauth_state' && typeof saved.state === 'string' && sameString(saved.state, state);
      return matches ? saved : null;
    } catch {
      return null;
    }
  }

  /** Validates the callback and returns the web URL to redirect to (with a one-time ticket). */
  async callback(query: { code?: string; state?: string; error?: string }, stateCookie?: string): Promise<string> {
    if (!this.configured) throw new GoogleSignInError('google_unavailable');

    // Recover the flow first so every failure, a cancel included, returns the
    // person to the screen they started from (sign-in, or account settings).
    const saved = await this.readState(query.state, stateCookie);
    const flow: GoogleFlow = saved?.linkUserId ? 'link' : 'sign-in';

    if (query.error) {
      // `access_denied` is what Google returns when the person cancels on its
      // account chooser / consent screen. Anything else is a provider failure.
      const code = query.error === 'access_denied' ? 'google_cancelled' : 'google_failed';
      throw new GoogleSignInError(code, 'provider returned an error', flow);
    }
    if (!saved || !query.code) throw new GoogleSignInError('google_state', undefined, flow);

    let profile: GoogleProfile;
    try {
      profile = await this.verifyCode(query.code, saved.verifier, saved.nonce);
    } catch (err) {
      if (err instanceof GoogleSignInError) throw new GoogleSignInError(err.code, err.message, flow);
      throw err;
    }

    if (saved.linkUserId) {
      try {
        await this.linkToUser(saved.linkUserId, profile);
      } catch (err) {
        if (err instanceof GoogleSignInError) throw new GoogleSignInError(err.code, err.message, 'link');
        throw err;
      }
      return `${this.auth.webUrl}/settings?linked=google`;
    }

    const { userId, outcome } = await this.resolveUser(profile);
    const ticket = await this.auth.issueOAuthTicket(userId);
    // Fragment: never sent to any server, never written to access logs.
    const fragment = new URLSearchParams({ ticket });
    if (saved.returnTo) fragment.set('returnTo', saved.returnTo);
    if (outcome) fragment.set('outcome', outcome);
    return `${this.auth.webUrl}/auth/callback#${fragment.toString()}`;
  }

  /** Exchanges the code (PKCE) and verifies the ID token signature, audience, issuer, expiry and nonce. */
  async verifyCode(code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
    const client = this.client();
    let idToken: string | undefined | null;
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier });
      idToken = tokens.id_token;
    } catch (err) {
      this.logger.warn(`Google code exchange failed: ${logSafe(err)}`);
      throw new GoogleSignInError('google_failed');
    }
    if (!idToken) throw new GoogleSignInError('google_failed', 'no id_token');
    return this.verifyIdToken(idToken, nonce, client);
  }

  async verifyIdToken(idToken: string, nonce: string, client = this.client()): Promise<GoogleProfile> {
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: this.config.get<string>('GOOGLE_CLIENT_ID') });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google ID token rejected: ${logSafe(err)}`);
      throw new GoogleSignInError('google_failed');
    }
    if (!payload?.sub || typeof payload.nonce !== 'string' || !sameString(payload.nonce, nonce)) {
      throw new GoogleSignInError('google_failed', 'nonce mismatch');
    }
    return {
      sub: payload.sub,
      email: payload.email?.toLowerCase(),
      emailVerified: payload.email_verified === true,
      givenName: payload.given_name,
      familyName: payload.family_name,
      picture: payload.picture,
    };
  }

  /**
   * Account resolution:
   *  1. an existing Google identity → that account;
   *  2. otherwise a verified Google email matching exactly one account → link it
   *     (if that account never verified its email, its password is removed and its
   *     sessions revoked, so a pre-registered impostor cannot keep access);
   *  3. otherwise → a new Traveler in the community organization.
   * Platform (Super Admin) accounts can never sign in with Google. Google never
   * grants a role beyond Traveler.
   */
  async resolveUser(profile: GoogleProfile): Promise<{ userId: string; outcome?: GoogleOutcome }> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'google', providerSubject: profile.sub } },
      include: { user: { include: { tenant: true } } },
    });
    if (identity) {
      this.assertUsable(identity.user);
      await this.prisma.userIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
      return { userId: identity.userId };
    }

    if (!profile.email || !profile.emailVerified) throw new GoogleSignInError('google_email_unverified');

    const matches = await this.prisma.user.findMany({
      where: { email: { equals: profile.email, mode: 'insensitive' }, deletedAt: null },
      include: { tenant: true },
    });
    if (matches.length > 1) throw new GoogleSignInError('google_account_ambiguous');

    if (matches.length === 1) {
      const user = matches[0];
      this.assertUsable(user);
      const neverVerified = !user.emailVerifiedAt;
      const passwordCleared = neverVerified && !!user.passwordHash;
      await this.prisma.$transaction(async (tx) => {
        await tx.userIdentity.create({
          data: { userId: user.id, provider: 'google', providerSubject: profile.sub, email: profile.email, emailVerified: true, lastUsedAt: new Date() },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
            ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
            ...(neverVerified ? { passwordHash: null } : {}),
          },
        });
      });
      if (neverVerified) await this.auth.revokeAllSessions(user.id);
      await this.audit.log({
        tenantId: user.tenantId, actorId: user.id, actorEmail: profile.email, action: 'PERMISSION_CHANGE',
        namespace: 'core', resource: 'user_identity', resourceId: user.id,
        metadata: { provider: 'google', linked: 'by-verified-email', passwordCleared },
      });
      return { userId: user.id, outcome: passwordCleared ? 'linked_password_removed' : 'linked' };
    }

    const tenantId = await this.auth.communityTenantId();
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: profile.email,
        firstName: (profile.givenName ?? profile.email.split('@')[0]).slice(0, 100),
        lastName: (profile.familyName ?? '').slice(0, 100),
        avatarUrl: profile.picture,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        identities: {
          create: { provider: 'google', providerSubject: profile.sub, email: profile.email, emailVerified: true, lastUsedAt: new Date() },
        },
      },
    });
    await this.rbac.grantSystemRole(user.id, 'PILGRIM');
    await this.audit.log({
      tenantId, actorId: user.id, actorEmail: profile.email, action: 'CREATE', namespace: 'core',
      resource: 'user', resourceId: user.id, metadata: { via: 'google' },
    });
    return { userId: user.id, outcome: 'created' };
  }

  async linkToUser(userId: string, profile: GoogleProfile) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
    if (!user) throw new GoogleSignInError('google_state');
    this.assertUsable(user);
    const existing = await this.prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'google', providerSubject: profile.sub } },
    });
    if (existing && existing.userId !== userId) throw new GoogleSignInError('google_already_linked');
    if (!existing) {
      await this.prisma.userIdentity.create({
        data: { userId, provider: 'google', providerSubject: profile.sub, email: profile.email, emailVerified: profile.emailVerified },
      });
      await this.audit.log({
        tenantId: user.tenantId, actorId: user.id, action: 'PERMISSION_CHANGE', namespace: 'core',
        resource: 'user_identity', resourceId: user.id, metadata: { provider: 'google', linked: 'explicit' },
      });
    }
  }

  private assertUsable(user: { status: string; deletedAt: Date | null; tenant: { type: string; status: string; deletedAt: Date | null } | null }) {
    if (user.tenant?.type === 'PLATFORM') throw new GoogleSignInError('google_privileged_account');
    if (user.deletedAt || user.status === 'LOCKED' || user.status === 'INACTIVE') {
      throw new GoogleSignInError('google_account_disabled');
    }
    if (!user.tenant || user.tenant.deletedAt || ['SUSPENDED', 'CHURNED'].includes(user.tenant.status)) {
      throw new GoogleSignInError('google_account_disabled');
    }
  }
}
