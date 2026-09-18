import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowPendingTenant, AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import type { Principal } from '../auth/principal';
import { PreferencesService } from './preferences.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

/**
 * Owner-only by construction: the user id comes from the verified session and
 * the path has no user id to tamper with.
 */
@ApiTags('preferences')
@ApiBearerAuth()
@Controller({ path: 'users/me/preferences', version: '1' })
@AnyAuthenticated()
@AllowPendingTenant()
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Language, time zone and notification preferences of the signed-in user' })
  async get(@CurrentUser() user: Principal) {
    return { success: true, data: await this.preferences.get(user.sub) };
  }

  @Put()
  @Throttle({ default: { limit: 60, ttl: 5 * 60_000 } })
  @ApiOperation({ summary: 'Update own preferences (partial); returns the saved preferences' })
  async update(@CurrentUser() user: Principal, @Body() dto: UpdatePreferencesDto) {
    return { success: true, data: await this.preferences.update(user.sub, dto) };
  }
}
