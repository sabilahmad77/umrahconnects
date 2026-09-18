import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { CurrentUser } from '../../common/decorators/tenant.decorator';
import type { Principal } from '../auth/principal';
import { requestContext } from '../pilgrims/account-links/pilgrim-account-links.controller';
import { InvitationTokenDto } from './traveler-link.dto';
import { TravelerLinksService } from './traveler-links.service';
import { TravelerTripsService } from './traveler-trips.service';

const MIN = 60_000;

/**
 * The signed-in traveler's own links and trip status (P06, D-022).
 *
 * `@AnyAuthenticated` routes: travelers hold no organization-wide capability
 * (D-007), so every read here is scoped by ownership in the service — the
 * caller's own account id, and only ACTIVE links.
 */
@ApiTags('travelers')
@ApiBearerAuth()
@Controller({ path: 'travelers/me', version: '1' })
export class TravelersController {
  constructor(
    private readonly links: TravelerLinksService,
    private readonly trips: TravelerTripsService,
  ) {}

  @Get('links')
  @AnyAuthenticated()
  @ApiOperation({ summary: "The caller's active links to organizations' traveler records" })
  async listLinks(@CurrentUser() user: Principal) {
    return { success: true, data: await this.links.listMine(user) };
  }

  @Get('trips')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Booking, group and visa status for the linked traveler records (status only)' })
  async listTrips(@CurrentUser() user: Principal) {
    return { success: true, data: await this.trips.tripsFor(user) };
  }

  @Post('links/preview')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 10 * MIN } })
  @ApiOperation({ summary: 'Who sent this invitation (only for the verified account it was sent to)' })
  async preview(@CurrentUser() user: Principal, @Body() dto: InvitationTokenDto) {
    return { success: true, data: await this.links.preview(user, dto.token) };
  }

  @Post('links/accept')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 10 * MIN } })
  @ApiOperation({ summary: 'Accept an invitation: link this account to the invited traveler record' })
  async accept(@CurrentUser() user: Principal, @Body() dto: InvitationTokenDto, @Req() req: Request) {
    return { success: true, data: await this.links.accept(user, dto.token, requestContext(req)) };
  }

  @Post('links/decline')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 10 * MIN } })
  @ApiOperation({ summary: 'Decline an invitation' })
  async decline(@CurrentUser() user: Principal, @Body() dto: InvitationTokenDto, @Req() req: Request) {
    return { success: true, data: await this.links.decline(user, dto.token, requestContext(req)) };
  }

  @Delete('links/:linkId')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End one of your own active links' })
  async unlink(@CurrentUser() user: Principal, @Param('linkId', ParseUUIDPipe) linkId: string, @Req() req: Request) {
    return { success: true, data: await this.links.unlink(user, linkId, requestContext(req)) };
  }
}
