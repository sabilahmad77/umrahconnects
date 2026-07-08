import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto, PUBLIC_SIGNUP_ROLES } from './dto/register.dto';
import { OtpLoginDto } from './dto/otp-login.dto';

export interface JwtPayload {
  sub: string;
  email?: string;
  phone?: string;
  tenantId: string;
  tenantType: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

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
  ) {}

  /** Shared tenant for self-registered travelers (find-or-create). */
  private async communityTenantId(): Promise<string> {
    const slug = 'umrah-connect-travelers';
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existing) return existing.id;
    const t = await this.prisma.tenant.create({
      data: {
        slug,
        name: 'Umrah Connect Travelers',
        type: 'OPERATOR',
        status: 'ACTIVE',
        email: 'travelers@umrahconnect.app',
        country: 'SA',
      } as any,
    });
    return t.id;
  }

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const { email, phone, password, firstName, lastName } = dto;

    // FIX-01: server-authoritative role gate. Privileged roles can never be
    // requested at public signup, regardless of what the client sends.
    // (Role assignment itself is server-controlled — new users only ever get
    // the community-traveler role; privileged roles require a Super Admin.)
    if (dto.roleInterest && !(PUBLIC_SIGNUP_ROLES as readonly string[]).includes(dto.roleInterest)) {
      this.logger.warn(`Blocked privileged-role signup attempt: roleInterest="${dto.roleInterest}" email="${email ?? 'n/a'}"`);
      throw new ForbiddenException('This role cannot be requested at public signup.');
    }

    const tenantId = dto.tenantId ?? (await this.communityTenantId());

    const existing = await this.prisma.user.findFirst({
      where: {
        tenantId,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
    });
    if (existing) {
      throw new ConflictException('User with this email or phone already exists');
    }

    const passwordHash = password ? await bcrypt.hash(password, this.BCRYPT_ROUNDS) : null;

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email,
        phone,
        passwordHash,
        firstName,
        lastName,
        status: 'PENDING_VERIFICATION',
      },
      include: { userRoles: { include: { role: true } } },
    });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const { email, password, tenantId } = dto;

    const user = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === 'LOCKED') {
      throw new UnauthorizedException('Account is locked. Contact your administrator.');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedException('Account is inactive.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    return this.generateTokens(user);
  }

  // Step 1: send OTP (for pilgrim phone-OTP login)
  async sendOtp(phone: string, purpose: string = 'login'): Promise<void> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { phone, codeHash, purpose, expiresAt },
    });

    // TODO: Send via Twilio SMS
    this.logger.debug(`OTP for ${phone}: ${code} (dev only)`);
  }

  // Step 2: verify OTP and issue tokens
  async verifyOtp(dto: OtpLoginDto): Promise<AuthTokens> {
    const { phone, code, tenantId } = dto;
    const codeHash = createHash('sha256').update(code).digest('hex');

    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        codeHash,
        purpose: 'login',
        usedAt: null,
        expiresAt: { gte: new Date() },
      },
    });

    if (!otpRecord) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (otpRecord.attempts >= this.OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Too many OTP attempts');
    }

    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { usedAt: new Date() },
    });

    let user = await this.prisma.user.findFirst({
      where: { tenantId, phone },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      // Auto-create pilgrim account on first OTP login
      user = await this.prisma.user.create({
        data: {
          tenantId,
          phone,
          firstName: '',
          lastName: '',
          status: 'ACTIVE',
          phoneVerifiedAt: new Date(),
        },
        include: { userRoles: { include: { role: true } } },
      });
    }

    return this.generateTokens(user);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(stored.user);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });
  }

  async validateUser(tenantId: string, email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
    });
    if (!user?.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  private async generateTokens(user: any): Promise<AuthTokens> {
    const roles = user.userRoles?.map((ur: any) => ur.role.name) ?? [];

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phone: user.phone,
      tenantId: user.tenantId,
      tenantType: 'OPERATOR',
      roles,
    };

    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = randomBytes(64).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiryDays = parseInt(
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d').replace('d', ''),
    );
    const expiresAt = new Date(Date.now() + refreshExpiryDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  // ── Password reset (JWT-token based; mailer = dev logger until SMTP wired) ──

  async forgotPassword(email: string): Promise<{ message: string; devResetLink?: string }> {
    const generic = { message: 'If that email exists, a reset link has been sent.' };
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return generic; // do not leak account existence

    const token = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'pwreset' },
      { expiresIn: '30m' },
    );
    const base = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    const link = `${base}/reset-password?token=${token}`;
    // Dev mailer: log the link. Replace with real SMTP/SES in production.
    this.logger.log(`[password-reset] ${email} → ${link}`);
    const isProd = this.config.get('NODE_ENV') === 'production';
    return isProd ? generic : { ...generic, devResetLink: link };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Reset link is invalid or has expired.');
    }
    if (payload?.purpose !== 'pwreset' || !payload?.sub) {
      throw new UnauthorizedException('Reset link is invalid.');
    }
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }
    const passwordHash = await bcrypt.hash(newPassword, this.BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });
    // Revoke all refresh tokens for safety
    await this.prisma.refreshToken.deleteMany({ where: { userId: payload.sub } }).catch(() => undefined);
    return { message: 'Password updated — you can now sign in.' };
  }
}
