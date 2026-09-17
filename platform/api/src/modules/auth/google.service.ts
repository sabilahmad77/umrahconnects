import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, PURPOSE } from './auth.service';

export const GOOGLE_STATE_COOKIE = 'uc_g_state';

/** Error codes appended to `${WEB_URL}/login?error=` — safe to show, no internals. */
export type GoogleErrorCode =
  | 'google_unavailable'
  | 'google_state'
  | 'google_failed'
  | 'google_email_unverified'
  | 'google_account_ambiguous'
  | 'google_privileged_account'
  | 'google_account_disabled'
  | 'google_already_linked';

export class GoogleSignInError extends Error {
  constructor(public readonly code: GoogleErrorCode, detail?: string) {
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

/**
 * Google Sign-In — OpenID Connect authorization-code flow with PKCE, state and
 * nonce. The client secret never leaves the server; the browser only ever
 * receives a 2-minute single-use ticket that it exchanges for a normal session.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  get missing(): string[] {
    return ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'].filter((k) => !this.config.get(k));
  }

  get configured(): boolean {
    return this.missing.length === 0;
  }

  get secureCookies(): boolean {
    return String(this.config.get('GOOGLE_REDIRECT_URI') ?? '').startsWith('https://');
  }

  private client(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.config.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      redirectUri: this.config.get<string>('GOOGLE_REDIRECT_URI'),
    });
  }

  /** Only same-site relative paths are accepted as post-login destinations. */
  static safeReturnTo(value: unknown): string {
    const v = typeof value === 'string' ? value : '';
    return /^\/(?![/\\])[\w\-./?=&%#]*$/.test(v) && v.length <= 200 ? v : '/dashboard';
  }

  loginErrorUrl(code: GoogleErrorCode): string {
    return `${this.auth.webUrl}/login?error=${code}`;
  }

  /** Builds the Google authorization URL and the signed state cookie value. */
  async start(returnTo: unknown, linkIntent?: string): Promise<{ url: string; stateCookie: string }> {
    if (!this.configured) throw new GoogleSignInError('google_unavailable');

    let linkUserId: string | undefined;
    if (linkIntent) {
      linkUserId = (await this.auth.consumeOneTimeToken(PURPOSE.OAUTH_LINK, linkIntent)) ?? undefined;
      if (!linkUserId) throw new GoogleSignInError('google_state', 'link intent invalid');
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

  /** Validates the callback and returns the web URL to redirect to (with a one-time ticket). */
  async callback(query: { code?: string; state?: string; error?: string }, stateCookie?: string): Promise<string> {
    if (!this.configured) throw new GoogleSignInError('google_unavailable');
    if (query.error) throw new GoogleSignInError('google_failed', `provider error ${query.error}`);
    if (!query.code || !query.state || !stateCookie) throw new GoogleSignInError('google_state');

    let saved: StatePayload;
    try {
      saved = await this.jwt.verifyAsync<StatePayload>(stateCookie, { audience: 'umrah-connects-oauth' });
    } catch {
      throw new GoogleSignInError('google_state');
    }
    if (saved.purpose !== 'google_oauth_state' || saved.state !== query.state) throw new GoogleSignInError('google_state');

    const profile = await this.verifyCode(query.code, saved.verifier, saved.nonce);

    if (saved.linkUserId) {
      await this.linkToUser(saved.linkUserId, profile);
      return `${this.auth.webUrl}/settings?linked=google`;
    }

    const userId = await this.resolveUser(profile);
    const ticket = await this.auth.issueOAuthTicket(userId);
    // Fragment: never sent to any server, never written to access logs.
    return `${this.auth.webUrl}/auth/callback#ticket=${encodeURIComponent(ticket)}&returnTo=${encodeURIComponent(saved.returnTo)}`;
  }

  /** Exchanges the code (PKCE) and verifies the ID token signature, audience, issuer, expiry and nonce. */
  async verifyCode(code: string, verifier: string, nonce: string): Promise<GoogleProfile> {
    const client = this.client();
    let idToken: string | undefined | null;
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: verifier });
      idToken = tokens.id_token;
    } catch (err) {
      this.logger.warn(`Google code exchange failed: ${(err as Error).message}`);
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
      this.logger.warn(`Google ID token rejected: ${(err as Error).message}`);
      throw new GoogleSignInError('google_failed');
    }
    if (!payload?.sub || payload.nonce !== nonce) throw new GoogleSignInError('google_failed', 'nonce mismatch');
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
  async resolveUser(profile: GoogleProfile): Promise<string> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_providerSubject: { provider: 'google', providerSubject: profile.sub } },
      include: { user: { include: { tenant: true } } },
    });
    if (identity) {
      this.assertUsable(identity.user);
      await this.prisma.userIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date() } });
      return identity.userId;
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
        metadata: { provider: 'google', linked: 'by-verified-email', passwordCleared: neverVerified },
      });
      return user.id;
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
    return user.id;
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
