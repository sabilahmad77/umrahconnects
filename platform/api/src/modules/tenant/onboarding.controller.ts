import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/onboarding.dto';
import { refreshCookieName, setCookie } from '../auth/session-cookie';
import { AuthService } from '../auth/auth.service';
import type { Principal } from '../auth/principal';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller({ path: 'onboarding', version: '1' })
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('organization')
  @HttpCode(HttpStatus.CREATED)
  @AnyAuthenticated()
  @Throttle({ default: { limit: 5, ttl: 60 * 60_000 } })
  @ApiOperation({ summary: 'Found an organization (pending KYC); returns a fresh session for the new role' })
  async create(
    @CurrentUser() user: Principal,
    @Body() dto: CreateOrganizationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.onboarding.createOrganization(user, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
    const secure = this.config.get<string>('NODE_ENV') === 'production';
    setCookie(res, refreshCookieName(secure), result.tokens.refreshToken, {
      maxAgeMs: this.auth.refreshTtlSeconds * 1000,
      secure,
    });
    const inBody = this.config.get<string>('AUTH_REFRESH_TOKEN_IN_BODY', 'true') !== 'false';
    return {
      success: true,
      data: {
        ...result,
        tokens: {
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresIn,
          ...(inBody ? { refreshToken: result.tokens.refreshToken } : {}),
        },
      },
    };
  }
}
