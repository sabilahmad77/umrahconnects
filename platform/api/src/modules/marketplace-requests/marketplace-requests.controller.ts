import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, TenantId } from '../../common/decorators/tenant.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { Principal } from '../auth/principal';
import { MarketplaceRequestsService } from './marketplace-requests.service';
import {
  ConvertOfferDto,
  CreateMarketplaceRequestDto,
  CreateOfferDto,
} from './dto/marketplace-requests.dto';

@ApiTags('marketplace-requests')
@ApiBearerAuth()
/** Every route answers with the standard `{ success: true, data }` envelope (P08). */
@Controller('marketplace/requests')
export class MarketplaceRequestsController {
  constructor(private svc: MarketplaceRequestsService) {}

  // ── Traveler (ownership enforced in the service: requester = caller) ────
  @Post()
  @AnyAuthenticated()
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Body() dto: CreateMarketplaceRequestDto,
  ) {
    return { success: true, data: await this.svc.create(tenantId, user.sub, dto) };
  }

  @Get('mine')
  @AnyAuthenticated()
  async mine(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.svc.listForTraveler(user.sub, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status,
      }),
    };
  }

  @Post(':id/close')
  @AnyAuthenticated()
  async close(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.close(user.sub, id) };
  }

  // ── Provider ────────────────────────────────────────────────
  @Get('open')
  @RequirePermissions('marketplace:listing:manage')
  async open(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('serviceType') serviceType?: string,
  ) {
    return {
      success: true,
      data: await this.svc.listOpen(user, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        serviceType,
      }),
    };
  }

  @Get('offers/mine')
  @RequirePermissions('marketplace:listing:manage')
  async myOffers(
    @CurrentUser() user: Principal,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return {
      success: true,
      data: await this.svc.listMyOffers(user.sub, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status,
      }),
    };
  }

  /** Visibility is decided in the service (requester, requester org staff, eligible providers). */
  @Get(':id')
  @AnyAuthenticated()
  async findOne(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.svc.findOne(id, user) };
  }

  @Post(':id/offers')
  @RequirePermissions('marketplace:listing:manage')
  async createOffer(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOfferDto,
  ) {
    return { success: true, data: await this.svc.createOffer(user, id, dto) };
  }

  @Post(':id/offers/:offerId/accept')
  @AnyAuthenticated()
  async acceptOffer(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return { success: true, data: await this.svc.acceptOffer(user.sub, id, offerId) };
  }

  @Post(':id/offers/:offerId/reject')
  @AnyAuthenticated()
  async rejectOffer(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return { success: true, data: await this.svc.rejectOffer(user.sub, id, offerId) };
  }

  @Post(':id/offers/:offerId/convert-to-booking')
  @AnyAuthenticated()
  async convertOfferToBooking(
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: ConvertOfferDto,
  ) {
    return {
      success: true,
      data: await this.svc.convertOfferToBooking(id, offerId, user.sub, dto ?? {}),
    };
  }
}
