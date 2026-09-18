import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser, TenantId } from '../../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import type { Principal } from '../../auth/principal';
import { InviteTravelerDto, RevokeAccountLinkDto } from './account-link.dto';
import { PilgrimAccountLinksService, RequestContext } from './pilgrim-account-links.service';

export function requestContext(req: Request): RequestContext {
  return {
    ip: (req as any).clientIp ?? req.ip,
    userAgent: req.headers['user-agent'],
    requestId: (req as any).requestId,
  };
}

/**
 * Traveler account access for one pilgrim record (P06, D-022). Reading the
 * history needs the record-read capability; inviting, resending and revoking
 * change who can see the record's trip status, so they need the record-update
 * capability — the same people who may change the record's contact email.
 */
@ApiTags('pilgrims')
@ApiBearerAuth()
@Controller({ path: 'pilgrims/:pilgrimId/account-links', version: '1' })
export class PilgrimAccountLinksController {
  constructor(private readonly links: PilgrimAccountLinksService) {}

  @Get()
  @RequirePermissions('crm:pilgrim:read')
  @ApiOperation({ summary: 'Traveler account invitations and links for this pilgrim record (newest first)' })
  async list(@TenantId() tenantId: string, @Param('pilgrimId', ParseUUIDPipe) pilgrimId: string) {
    return { success: true, data: await this.links.list(tenantId, pilgrimId) };
  }

  @Post()
  @RequirePermissions('crm:pilgrim:update')
  @ApiOperation({ summary: "Email the traveler an invitation to link their account to this record" })
  async invite(
    @CurrentUser() user: Principal,
    @Param('pilgrimId', ParseUUIDPipe) pilgrimId: string,
    @Body() dto: InviteTravelerDto,
    @Req() req: Request,
  ) {
    return { success: true, data: await this.links.invite(user, pilgrimId, dto, requestContext(req)) };
  }

  @Post(':linkId/resend')
  @RequirePermissions('crm:pilgrim:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send the invitation again with a new link (the previous link stops working)' })
  async resend(
    @CurrentUser() user: Principal,
    @Param('pilgrimId', ParseUUIDPipe) pilgrimId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Req() req: Request,
  ) {
    return { success: true, data: await this.links.resend(user, pilgrimId, linkId, requestContext(req)) };
  }

  @Post(':linkId/revoke')
  @RequirePermissions('crm:pilgrim:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Withdraw an invitation or end an active link, with a reason' })
  async revoke(
    @CurrentUser() user: Principal,
    @Param('pilgrimId', ParseUUIDPipe) pilgrimId: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body() dto: RevokeAccountLinkDto,
    @Req() req: Request,
  ) {
    return { success: true, data: await this.links.revoke(user, pilgrimId, linkId, dto, requestContext(req)) };
  }
}
