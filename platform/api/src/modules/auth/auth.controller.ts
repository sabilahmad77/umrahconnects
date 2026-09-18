import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  Res,
  Query,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, AuthTokens, SessionContext } from './auth.service';
import { GoogleAuthService, GOOGLE_STATE_COOKIE } from './google.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpLoginDto } from './dto/otp-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { ChangePasswordDto, ForgotPasswordDto, OAuthTicketDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AllowPendingTenant, AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { clearCookie, readCookie, refreshCookieName, setCookie } from './session-cookie';
import type { Principal } from './principal';

const MIN = 60_000;

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly google: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  private get secureCookies() {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** While the web client still reads the refresh token from JSON, keep returning it. */
  private get refreshInBody() {
    return this.config.get<string>('AUTH_REFRESH_TOKEN_IN_BODY', 'true') !== 'false';
  }

  private ctx(req: Request): SessionContext {
    return { ip: (req as any).clientIp ?? req.ip, userAgent: req.headers['user-agent'] };
  }

  private issue(res: Response, tokens: AuthTokens) {
    setCookie(res, refreshCookieName(this.secureCookies), tokens.refreshToken, {
      maxAgeMs: this.authService.refreshTtlSeconds * 1000,
      secure: this.secureCookies,
    });
    const body: Partial<AuthTokens> = { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
    if (this.refreshInBody) body.refreshToken = tokens.refreshToken;
    return { success: true, data: body };
  }

  // ── Email + password ───────────────────────────────────────────────────

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 10 * MIN } })
  @ApiOperation({ summary: 'Create a traveler account (community organization, Traveler role)' })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.authService.register(dto, this.ctx(req)));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 5 * MIN }, account: { limit: 8, ttl: 5 * MIN } })
  @ApiOperation({ summary: 'Sign in with email + password' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.authService.login(dto, this.ctx(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 5 * MIN } })
  @ApiOperation({ summary: 'Rotate the refresh token (httpOnly cookie or body)' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto?.refreshToken ?? readCookie(req, refreshCookieName(this.secureCookies));
    if (!token) throw new UnauthorizedException('Invalid or expired refresh token');
    try {
      return this.issue(res, await this.authService.refreshTokens(token, this.ctx(req)));
    } catch (err) {
      clearCookie(res, refreshCookieName(this.secureCookies), this.secureCookies);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token (cookie or body)' })
  async logout(@Body() dto: RefreshTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto?.refreshToken ?? readCookie(req, refreshCookieName(this.secureCookies));
    if (token) await this.authService.revokeRefreshToken(token);
    clearCookie(res, refreshCookieName(this.secureCookies), this.secureCookies);
    return { success: true, message: 'Logged out' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  @AllowPendingTenant()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out every session of the current user (access tokens included)' })
  async logoutAll(@CurrentUser() user: Principal, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeAllSessions(user.sub);
    clearCookie(res, refreshCookieName(this.secureCookies), this.secureCookies);
    return { success: true, message: 'All sessions signed out' };
  }

  @Get('me')
  @AnyAuthenticated()
  @AllowPendingTenant()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user, organization, roles and server-resolved capabilities' })
  async me(@CurrentUser() user: Principal) {
    return { success: true, data: await this.authService.profile(user) };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  @AllowPendingTenant()
  @Throttle({ default: { limit: 10, ttl: 15 * MIN } })
  @ApiBearerAuth()
  async changePassword(@CurrentUser() user: Principal, @Body() dto: ChangePasswordDto) {
    return { success: true, data: await this.authService.changePassword(user, dto.currentPassword, dto.newPassword) };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * MIN }, account: { limit: 3, ttl: 15 * MIN } })
  @ApiOperation({ summary: 'Email a single-use password reset link' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return { success: true, data: await this.authService.forgotPassword(dto.email) };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * MIN } })
  @ApiOperation({ summary: 'Set a new password with a single-use reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return { success: true, data: await this.authService.resetPassword(dto.token, dto.password) };
  }

  // ── Email verification ─────────────────────────────────────────────────

  @Post('verify-email/request')
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  @AllowPendingTenant()
  @Throttle({ default: { limit: 5, ttl: 15 * MIN } })
  @ApiBearerAuth()
  async requestVerification(@CurrentUser() user: Principal) {
    return { success: true, data: await this.authService.sendVerificationEmail(user.sub) };
  }

  @Public()
  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 15 * MIN } })
  async confirmVerification(@Body() dto: VerifyEmailDto) {
    return { success: true, data: await this.authService.confirmEmail(dto.token) };
  }

  // ── Google Sign-In ─────────────────────────────────────────────────────

  @Public()
  @Get('google/status')
  @ApiOperation({ summary: 'Whether Google Sign-In is configured on this deployment' })
  googleStatus() {
    // `mode` is 'local-stub' only in development/test with the loopback stub provider,
    // so the sign-in page can say plainly that it is not a real Google login.
    return { success: true, data: { enabled: this.google.configured, mode: this.google.mode } };
  }

  @Public()
  @Get('google/start')
  @Throttle({ default: { limit: 30, ttl: 5 * MIN } })
  @ApiOperation({ summary: 'Begin Google Sign-In (browser navigation)' })
  async googleStart(
    @Query('returnTo') returnTo: string,
    @Query('intent') intent: string,
    @Res() res: Response,
  ) {
    try {
      const { url, stateCookie } = await this.google.start(returnTo, intent || undefined);
      setCookie(res, GOOGLE_STATE_COOKIE, stateCookie, { maxAgeMs: 10 * MIN, secure: this.google.secureCookies });
      return res.redirect(302, url);
    } catch (err) {
      return res.redirect(302, this.google.errorUrl(err));
    }
  }

  @Public()
  @Get('google/callback')
  @Throttle({ default: { limit: 30, ttl: 5 * MIN } })
  @ApiOperation({ summary: 'Google OAuth redirect target' })
  async googleCallback(
    @Query() query: { code?: string; state?: string; error?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const stateCookie = readCookie(req, GOOGLE_STATE_COOKIE);
    clearCookie(res, GOOGLE_STATE_COOKIE, this.google.secureCookies);
    try {
      return res.redirect(302, await this.google.callback(query, stateCookie));
    } catch (err) {
      return res.redirect(302, this.google.errorUrl(err));
    }
  }

  @Public()
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 5 * MIN } })
  @ApiOperation({ summary: 'Exchange the one-time sign-in ticket for a session' })
  async googleExchange(@Body() dto: OAuthTicketDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.authService.exchangeOAuthTicket(dto.ticket, this.ctx(req)));
  }

  @Post('google/link-intent')
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  @AllowPendingTenant()
  @Throttle({ default: { limit: 10, ttl: 5 * MIN } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One-time intent to link Google to the signed-in account; then open google/start?intent=' })
  async googleLinkIntent(@CurrentUser() user: Principal) {
    if (!this.google.configured) throw new ServiceUnavailableException('Google Sign-In is not configured');
    if (user.tenantType === 'PLATFORM') {
      // 403, not 401: the session is valid, the account type is simply not allowed.
      throw new ForbiddenException({ code: 'GOOGLE_NOT_ALLOWED', message: 'Platform accounts cannot use Google Sign-In' });
    }
    return { success: true, data: { intent: await this.authService.issueLinkIntent(user.sub) } };
  }


  // ── Phone OTP (disabled until an SMS provider is integrated) ───────────

  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 15 * MIN } })
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.authService.sendOtp(dto.phone);
    return { success: true, message: 'Code sent' };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 15 * MIN } })
  async verifyOtp(@Body() dto: OtpLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issue(res, await this.authService.verifyOtp(dto, this.ctx(req)));
  }
}
