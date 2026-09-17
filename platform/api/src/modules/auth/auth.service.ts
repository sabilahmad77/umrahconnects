import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { COMMUNITY_TENANT_SLUG } from '../rbac/catalog';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpLoginDto } from './dto/otp-login.dto';
import { ACCESS_TOKEN_TYPE } from './strategies/jwt.strategy';
import type { Principal } from './principal';

export interface JwtPayload {
  sub: string;
  email?: string | null;
  phone?: string | null;
  tenantId: string;
  tenantType: string;
  roles: string[];
  typ?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

type UserWithRoles = Prisma.UserGetPayload<{ include: { userRoles: { include: { role: true } }; tenant: true } }>;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const opaqueToken = () => randomBytes(32).toString('base64url');
// A real bcrypt hash (cost 12) so an unknown email costs the same as a wrong password.
let dummyHash: string | undefined;
const timingHash = () => (dummyHash ??= bcrypt.hashSync(randomBytes(16).toString('hex'), 12));

export const PURPOSE = {
  RESET: 'password_reset',
  VERIFY_EMAIL: 'email_verify',
  OAUTH_TICKET: 'oauth_ticket',
  OAUTH_LINK: 'oauth_link_intent',
  OTP_LOGIN: 'login',
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly OTP_MAX_ATTEMPTS = 5;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private mail: MailService,
    private rbac: RbacService,
    private audit: AuditService,
  ) {}

  // ── Configuration ──────────────────────────────────────────────────────

  get webUrl(): string {
    return (this.config.get<string>('WEB_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  get accessTtlSeconds(): number {
    return parseDuration(this.config.get<string>('JWT_EXPIRES_IN', '15m'), 900);
  }

  get refreshTtlSeconds(): number {
    return parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'), 7 * 86400);
  }

  private get maxFailedLogins(): number {
    return Number(this.config.get<string>('AUTH_MAX_FAILED_LOGINS', '10'));
  }

  private get lockoutMinutes(): number {
    return Number(this.config.get<string>('AUTH_LOCKOUT_MINUTES', '15'));
  }

  static revocationInstant() {
    return new Date(Math.floor(Date.now() / 1000) * 1000);
  }

  /** Shared organization for self-registered travelers (find-or-create). */
  async communityTenantId(): Promise<string> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: COMMUNITY_TENANT_SLUG } });
    if (existing) return existing.id;
    const t = await this.prisma.tenant.create({
      data: {
        slug: COMMUNITY_TENANT_SLUG,
        name: 'Umrah Connect Travelers',
        type: 'OPERATOR',
        status: 'ACTIVE',
        email: 'travelers@umrahconnect.io',
        country: 'SA',
      },
    });
    return t.id;
  }

  private loadUser(where: Prisma.UserWhereUniqueInput) {
    return this.prisma.user.findUnique({ where, include: { userRoles: { include: { role: true } }, tenant: true } });
  }

  // ── Registration ───────────────────────────────────────────────────────

  /**
   * Public signup always creates a Traveler in the community organization.
   * The client cannot choose an organization, a role or a status.
   */
  async register(dto: RegisterDto, ctx: SessionContext = {}): Promise<AuthTokens> {
    const tenantId = await this.communityTenantId();
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        OR: [{ email: { equals: email, mode: 'insensitive' } }, ...(dto.phone ? [{ phone: dto.phone }] : [])],
      },
    });
    if (existing) throw new ConflictException('An account with this email or phone already exists');

    const passwordHash = await bcrypt.hash(dto.password, this.BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        status: 'PENDING_VERIFICATION',
      },
    });
    await this.rbac.grantSystemRole(user.id, 'PILGRIM');
    await this.sendVerificationEmail(user.id).catch((err) =>
      this.logger.warn(`Verification email not sent: ${(err as Error).message}`),
    );
    await this.audit.log({
      tenantId, actorId: user.id, actorEmail: email, action: 'CREATE', namespace: 'core', resource: 'user',
      resourceId: user.id, metadata: { via: 'signup', roleInterest: dto.roleInterest ?? null },
    });

    return this.generateTokens((await this.loadUser({ id: user.id }))!, ctx);
  }

  // ── Login ──────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ctx: SessionContext = {}): Promise<AuthTokens> {
    const email = dto.email.trim().toLowerCase();
    const candidates = await this.prisma.user.findMany({
      where: {
        email: { equals: email, mode: 'insensitive' },
        deletedAt: null,
        ...(dto.tenantId ? { tenantId: dto.tenantId } : {}),
      },
      include: { userRoles: { include: { role: true } }, tenant: true },
    });

    if (candidates.length === 0) {
      await bcrypt.compare(dto.password, timingHash());
      throw new UnauthorizedException('Invalid credentials');
    }

    const matched: UserWithRoles[] = [];
    for (const c of candidates) {
      if (c.passwordHash && (await bcrypt.compare(dto.password, c.passwordHash))) matched.push(c);
    }

    if (matched.length === 0) {
      await this.recordFailedLogin(candidates.map((c) => c.id));
      throw new UnauthorizedException('Invalid credentials');
    }
    if (matched.length > 1) {
      throw new UnauthorizedException({
        code: 'TENANT_REQUIRED',
        message: 'This email is registered in multiple workspaces. Select one to continue.',
        tenants: matched.map((m) => ({ id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug })),
      });
    }

    const user = matched[0];
    this.assertCanSignIn(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ip?.slice(0, 64),
        loginCount: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    return this.generateTokens(user, ctx);
  }

  /** Account-level checks shared by every sign-in method. */
  assertCanSignIn(user: UserWithRoles) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Too many failed sign-in attempts. Try again later or reset your password.');
    }
    if (user.status === 'LOCKED') {
      throw new UnauthorizedException('Account is locked. Contact your administrator.');
    }
    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Your account has been suspended or deactivated. Contact your administrator.');
    }
    if (!user.tenant || user.tenant.deletedAt || ['SUSPENDED', 'CHURNED'].includes(user.tenant.status)) {
      throw new UnauthorizedException('Your organization is not active. Contact support.');
    }
  }

  private async recordFailedLogin(userIds: string[]) {
    const lockUntil = new Date(Date.now() + this.lockoutMinutes * 60_000);
    for (const id of userIds) {
      const u = await this.prisma.user.update({
        where: { id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true, lockedUntil: true },
      });
      if (u.failedLoginCount >= this.maxFailedLogins && !(u.lockedUntil && u.lockedUntil > new Date())) {
        await this.prisma.user.update({ where: { id }, data: { lockedUntil: lockUntil, failedLoginCount: 0 } });
        this.logger.warn(`Account ${id} temporarily locked after repeated failed sign-ins`);
      }
    }
  }

  // ── Tokens & sessions ──────────────────────────────────────────────────

  async generateTokens(user: UserWithRoles, ctx: SessionContext = {}): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      tenantType: user.tenant?.type ?? 'OPERATOR',
      roles: (user.userRoles ?? [])
        .filter((ur) => !ur.expiresAt || ur.expiresAt > new Date())
        .map((ur) => ur.role.name),
      typ: ACCESS_TOKEN_TYPE,
    };
    const accessToken = this.jwtService.sign(payload, { expiresIn: this.accessTtlSeconds });

    const rawRefreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawRefreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
        userAgent: ctx.userAgent?.slice(0, 255),
        ipAddress: ctx.ip?.slice(0, 64),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: this.accessTtlSeconds };
  }

  /**
   * Rotating refresh. Presenting an already-rotated token is treated as token
   * theft: every session of that user is revoked.
   */
  async refreshTokens(refreshToken: string, ctx: SessionContext = {}): Promise<AuthTokens> {
    if (!refreshToken) throw new UnauthorizedException('Invalid or expired refresh token');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!stored) throw new UnauthorizedException('Invalid or expired refresh token');

    if (stored.revokedAt) {
      // A rotated token only reappears if it was copied. Allow a short grace for concurrent tabs.
      if (Date.now() - stored.revokedAt.getTime() > 30_000) {
        await this.revokeAllSessions(stored.userId);
        this.logger.warn(`Refresh token reuse detected for user ${stored.userId}; all sessions revoked`);
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Invalid or expired refresh token');

    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) throw new UnauthorizedException('Invalid or expired refresh token');

    const user = await this.loadUser({ id: stored.userId });
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid or expired refresh token');
    this.assertCanSignIn(user);
    return this.generateTokens(user, ctx);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({ where: { id: userId }, data: { sessionsRevokedAt: AuthService.revocationInstant() } }),
    ]);
  }

  async profile(principal: Principal) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.sub },
      select: {
        id: true, email: true, phone: true, firstName: true, lastName: true, avatarUrl: true, status: true,
        emailVerifiedAt: true, locale: true, timezone: true, createdAt: true, passwordHash: true,
        tenant: { select: { id: true, name: true, slug: true, type: true, status: true } },
        identities: { select: { provider: true, email: true, createdAt: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const permissions = await this.rbac.getUserPermissions(principal.sub, principal.tenantId);
    const { passwordHash, ...rest } = user;
    return {
      ...principal,
      ...rest,
      hasPassword: !!passwordHash,
      emailVerified: !!user.emailVerifiedAt,
      permissions,
    };
  }

  async changePassword(principal: Principal, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: principal.sub } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS) },
    });
    await this.revokeAllSessions(user.id);
    await this.audit.log({
      tenantId: user.tenantId, actorId: user.id, actorEmail: user.email ?? undefined, action: 'UPDATE',
      namespace: 'core', resource: 'user_password', resourceId: user.id,
    });
    return { message: 'Password changed. Please sign in again on your other devices.' };
  }

  // ── One-time tokens (reset, verification, OAuth tickets) ───────────────

  private async issueOneTimeToken(purpose: string, userId: string, email: string | null, ttlMinutes: number) {
    await this.prisma.otpCode.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = opaqueToken();
    await this.prisma.otpCode.create({
      data: {
        userId,
        email,
        purpose,
        codeHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });
    return token;
  }

  /** Atomically consumes a one-time token; returns its user id or null. */
  async consumeOneTimeToken(purpose: string, token: string): Promise<string | null> {
    const row = await this.prisma.otpCode.findFirst({
      where: { codeHash: sha256(token), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row?.userId) return null;
    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return claimed.count === 1 ? row.userId : null;
  }

  async issueOAuthTicket(userId: string) {
    return this.issueOneTimeToken(PURPOSE.OAUTH_TICKET, userId, null, 2);
  }

  async issueLinkIntent(userId: string) {
    return this.issueOneTimeToken(PURPOSE.OAUTH_LINK, userId, null, 5);
  }

  async exchangeOAuthTicket(ticket: string, ctx: SessionContext = {}): Promise<AuthTokens> {
    const userId = await this.consumeOneTimeToken(PURPOSE.OAUTH_TICKET, ticket);
    if (!userId) throw new UnauthorizedException('Sign-in link is invalid or has expired');
    const user = await this.loadUser({ id: userId });
    if (!user || user.deletedAt) throw new UnauthorizedException('Sign-in link is invalid or has expired');
    this.assertCanSignIn(user);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ctx.ip?.slice(0, 64), loginCount: { increment: 1 } },
    });
    return this.generateTokens(user, ctx);
  }

  // ── Password reset ─────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<{ message: string; delivery: string }> {
    const generic = 'If an account exists for that email, a reset link has been sent.';
    const normalized = email.trim().toLowerCase();
    const users = await this.prisma.user.findMany({
      where: { email: { equals: normalized, mode: 'insensitive' }, deletedAt: null, status: { not: 'INACTIVE' } },
      include: { tenant: { select: { name: true } } },
    });
    if (!this.mail.canDeliver) {
      // Do not pretend: without a mail transport nobody can receive the link.
      throw new ServiceUnavailableException('Password reset email is temporarily unavailable. Contact support.');
    }
    for (const user of users) {
      const token = await this.issueOneTimeToken(PURPOSE.RESET, user.id, user.email, 30);
      const link = `${this.webUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await this.mail.send({
        to: user.email!,
        subject: 'Reset your Umrah Connect password',
        text:
          `A password reset was requested for your ${user.tenant?.name ?? 'Umrah Connect'} account.\n\n` +
          `Open this link within 30 minutes to choose a new password:\n${link}\n\n` +
          `If you did not request this, you can ignore this email.`,
      });
    }
    return { message: generic, delivery: 'email' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const userId = await this.consumeOneTimeToken(PURPOSE.RESET, token);
    if (!userId) throw new UnauthorizedException('Reset link is invalid or has expired.');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.revokeAllSessions(userId);
    await this.audit.log({
      tenantId: user.tenantId, actorId: user.id, actorEmail: user.email ?? undefined, action: 'UPDATE',
      namespace: 'core', resource: 'user_password', resourceId: user.id, metadata: { via: 'reset' },
    });
    return { message: 'Password updated — you can now sign in.' };
  }

  // ── Email verification ─────────────────────────────────────────────────

  async sendVerificationEmail(userId: string): Promise<{ delivered: boolean; alreadyVerified?: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) throw new BadRequestException('This account has no email address');
    if (user.emailVerifiedAt) return { delivered: false, alreadyVerified: true };
    if (!this.mail.canDeliver) {
      throw new ServiceUnavailableException('Verification email is temporarily unavailable.');
    }
    const token = await this.issueOneTimeToken(PURPOSE.VERIFY_EMAIL, user.id, user.email, 24 * 60);
    const link = `${this.webUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const result = await this.mail.send({
      to: user.email,
      subject: 'Confirm your Umrah Connect email',
      text: `Welcome to Umrah Connect.\n\nConfirm your email address within 24 hours:\n${link}\n`,
    });
    return { delivered: result.delivered };
  }

  async confirmEmail(token: string) {
    const userId = await this.consumeOneTimeToken(PURPOSE.VERIFY_EMAIL, token);
    if (!userId) throw new UnauthorizedException('Verification link is invalid or has expired.');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' } : {}),
      },
    });
    return { message: 'Email confirmed.', emailVerified: true };
  }

  // ── Phone OTP (requires an SMS provider) ───────────────────────────────

  private get smsConfigured(): boolean {
    return false; // No SMS provider is integrated. See docs/control-tower/BLOCKERS.md.
  }

  async sendOtp(phone: string, purpose: string = PURPOSE.OTP_LOGIN): Promise<void> {
    if (!this.smsConfigured) throw new ServiceUnavailableException('Phone sign-in is not available.');
    const code = randomInt(100000, 1000000).toString();
    await this.prisma.otpCode.create({
      data: { phone, codeHash: sha256(code), purpose, expiresAt: new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60_000) },
    });
  }

  async verifyOtp(dto: OtpLoginDto, ctx: SessionContext = {}): Promise<AuthTokens> {
    if (!this.smsConfigured) throw new ServiceUnavailableException('Phone sign-in is not available.');
    const record = await this.prisma.otpCode.findFirst({
      where: { phone: dto.phone, purpose: PURPOSE.OTP_LOGIN, usedAt: null, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= this.OTP_MAX_ATTEMPTS) throw new UnauthorizedException('Invalid or expired code');
    if (record.codeHash !== sha256(dto.code)) {
      await this.prisma.otpCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.prisma.otpCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    // Only existing accounts may sign in by phone; the organization is never taken from the client.
    const users = await this.prisma.user.findMany({
      where: { phone: dto.phone, deletedAt: null },
      include: { userRoles: { include: { role: true } }, tenant: true },
    });
    if (users.length !== 1) throw new UnauthorizedException('Invalid or expired code');
    this.assertCanSignIn(users[0]);
    return this.generateTokens(users[0], ctx);
  }
}

export function parseDuration(value: string | undefined, fallbackSeconds: number): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(String(value ?? '').trim());
  if (!m) return fallbackSeconds;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400, '': 1 } as Record<string, number>)[m[2]];
}
