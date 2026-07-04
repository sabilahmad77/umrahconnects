import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, TenantId } from '../../common/decorators/tenant.decorator';
import { MarketplaceRequestsService } from './marketplace-requests.service';

@ApiTags('marketplace-requests')
@ApiBearerAuth()
@Controller('marketplace/requests')
export class MarketplaceRequestsController {
  constructor(private svc: MarketplaceRequestsService) {}

  // ── Traveler ────────────────────────────────────────────────
  @Post()
  async create(@TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: any) {
    return this.svc.create(tenantId, user.sub ?? user.id, dto);
  }

  @Get('mine')
  async mine(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listForTraveler(user.sub ?? user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }

  @Post(':id/close')
  async close(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.close(user.sub ?? user.id, id);
  }

  // ── Provider ────────────────────────────────────────────────
  @Get('open')
  async open(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('serviceType') serviceType?: string,
  ) {
    return this.svc.listOpen(tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      serviceType,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Post(':id/offers')
  async createOffer(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.svc.createOffer(user.sub ?? user.id, id, dto);
  }

  @Post(':id/offers/:offerId/accept')
  async acceptOffer(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.svc.acceptOffer(user.sub ?? user.id, id, offerId);
  }

  @Post(':id/offers/:offerId/reject')
  async rejectOffer(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.svc.rejectOffer(user.sub ?? user.id, id, offerId);
  }

  @Post(':id/offers/:offerId/convert-to-booking')
  async convertOfferToBooking(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: any,
  ) {
    return this.svc.convertOfferToBooking(id, offerId, user.sub ?? user.id, dto ?? {});
  }

  @Get('offers/mine')
  async myOffers(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.listMyOffers(user.sub ?? user.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
    });
  }
}
