import { Throttle } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { Public, PublicWithOptionalUser } from '../../common/decorators/public.decorator';
import { assertNotPlatformAccount } from './listing-rules';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import type { Principal } from '../auth/principal';
import { MarketplaceService } from './marketplace.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { MyListingsQueryDto, QueryListingDto } from './dto/query-listing.dto';
import { CreateVendorDto, UpdateVendorDto } from './dto/create-vendor.dto';
import { CreateQuoteDto, RespondQuoteDto } from './dto/create-quote.dto';
import {
  CreateListingBookingDto,
  CreateListingInquiryDto,
  RateVendorDto,
  RespondInquiryDto,
  UpdateListingBookingDto,
} from './dto/marketplace.dto';

@ApiTags('marketplace')
@Controller({ path: 'marketplace', version: '1' })
@ApiBearerAuth()
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Listings ─────────────────────────────────────────────────────────────────

  @Get('listings')
  @Public()
  @ApiOperation({ summary: 'Public catalogue: search, category/city/price filters, sorting, pagination' })
  async findAllListings(@Query() query: QueryListingDto) {
    return { success: true, data: await this.marketplaceService.searchListings(query) };
  }

  @Get('listings/mine')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "The caller organization's listings in every status" })
  async findMyListings(@TenantId() tenantId: string, @Query() query: MyListingsQueryDto) {
    return { success: true, data: await this.marketplaceService.myListings(tenantId, query) };
  }

  @Get('listings/mine/:id')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'One of my listings, in any status (404 for anyone else)' })
  async findMyListing(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.myListing(tenantId, id) };
  }

  @Get('listings/:id')
  @Public()
  @ApiOperation({ summary: 'Published listing detail' })
  async findOneListing(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.findPublicListing(id) };
  }

  @Post('listings')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: "Create a listing for one of the caller organization's seller profiles" })
  async createListing(@TenantId() tenantId: string, @Body() dto: CreateListingDto) {
    return { success: true, data: await this.marketplaceService.createListing(tenantId, dto) };
  }

  @Put('listings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Update my listing (details, price, images, status transitions)' })
  async updateListing(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return { success: true, data: await this.marketplaceService.updateListing(tenantId, id, dto) };
  }

  @Delete('listings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive my listing (soft delete)' })
  async deactivateListing(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.archiveListing(tenantId, id) };
  }

  // ── Inquiries ─────────────────────────────────────────────────────────────
  @Post('listings/:id/inquiries')
  @PublicWithOptionalUser()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @ApiOperation({ summary: 'Send an inquiry about a published listing' })
  async createInquiry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateListingInquiryDto,
    @CurrentUser() user?: Principal,
  ) {
    return { success: true, data: await this.marketplaceService.createInquiry(id, user?.sub ?? null, body) };
  }

  @Get('listings/:id/inquiries')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Inquiries on my listing' })
  async listInquiries(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.marketplaceService.findOwnedListing(tenantId, id);
    return { success: true, data: await this.marketplaceService.listInquiries({ listingId: id }) };
  }

  @Get('inquiries')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "Inquiries on every listing of the caller's organization" })
  async listMyInquiries(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.listInquiries({ tenantId }) };
  }

  @Put('inquiries/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Respond to an inquiry' })
  async respondInquiry(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondInquiryDto,
  ) {
    const data = await this.marketplaceService.respondInquiry(tenantId, id, body.response, body.status);
    return { success: true, data };
  }

  // ── Bookings ──────────────────────────────────────────────────────────────
  @Post('listings/:id/bookings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Create booking against a listing (the caller is the customer)' })
  async createBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() body: CreateListingBookingDto,
  ) {
    assertNotPlatformAccount(user);
    return { success: true, data: await this.marketplaceService.createBooking(id, user.sub, body) };
  }

  @Get('listings/:id/bookings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Bookings on my listing' })
  async listListingBookings(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.marketplaceService.findOwnedListing(tenantId, id);
    return { success: true, data: await this.marketplaceService.listBookings({ listingId: id }) };
  }

  @Get('bookings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "Bookings on every listing of the caller's organization" })
  async listMyBookings(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.listBookings({ tenantId }) };
  }

  @Get('bookings/mine')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List bookings I placed as a customer/traveler' })
  async listMyTravelerBookings(@CurrentUser() user: Principal) {
    return { success: true, data: await this.marketplaceService.listBookings({ userId: user.sub }) };
  }

  @Post('bookings/:id/cancel')
  @RequirePermissions('marketplace:listing:read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer cancels their own pending, unpaid booking' })
  async cancelMyBooking(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.cancelOwnBooking(user, id) };
  }

  @Put('bookings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Provider updates booking status / operational details' })
  async updateBooking(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateListingBookingDto,
  ) {
    return { success: true, data: await this.marketplaceService.updateBooking(tenantId, id, body, user) };
  }

  // ── Vendors (seller profiles) ─────────────────────────────────────────────────

  @Get('vendors')
  @Public()
  @ApiOperation({ summary: 'List vendors (public discovery)' })
  async findAllVendors(@Query('type') type?: string, @Query('city') city?: string) {
    return { success: true, data: await this.marketplaceService.findAllVendors(type, city) };
  }

  @Get('vendors/mine')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "The organization's primary seller profile, or null if it has none yet" })
  async findMyVendor(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.findMyVendor(tenantId) };
  }

  @Get('vendors/mine/all')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "Every seller profile of the caller's organization" })
  async findMyVendors(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.findMyVendors(tenantId) };
  }

  @Post('vendors')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Create a seller profile for my organization' })
  async createVendor(@TenantId() tenantId: string, @Body() dto: CreateVendorDto) {
    return { success: true, data: await this.marketplaceService.createVendor(tenantId, dto) };
  }

  @Put('vendors/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: "Edit one of my organization's seller profiles" })
  async updateVendor(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return { success: true, data: await this.marketplaceService.updateVendor(tenantId, id, dto) };
  }

  @Get('vendors/:id')
  @Public()
  @ApiOperation({ summary: 'Get vendor profile with its published listings' })
  async findOneVendor(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.findOneVendor(id) };
  }

  @Post('vendors/:id/ratings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Rate a vendor' })
  async rateVendor(
    @TenantId() tenantId: string,
    @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RateVendorDto,
  ) {
    const data = await this.marketplaceService.rateVendor(tenantId, id, user.sub, body.rating, body.comment);
    return { success: true, data };
  }

  // ── Quotes ───────────────────────────────────────────────────────────────────

  @Post('quotes')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Ask the seller of a listing for a quote' })
  async createQuote(@TenantId() tenantId: string, @Body() dto: CreateQuoteDto) {
    return { success: true, data: await this.marketplaceService.createQuote(tenantId, dto) };
  }

  @Get('quotes')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Quotes my organization asked for' })
  async findMyQuotes(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.findMyQuotes(tenantId) };
  }

  @Get('quotes/incoming')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "Quotes other organizations asked my organization's seller profiles for" })
  async findIncomingQuotes(@TenantId() tenantId: string) {
    return { success: true, data: await this.marketplaceService.findIncomingQuotes(tenantId) };
  }

  @Put('quotes/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Seller responds to a quote with a price' })
  async respondToQuote(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondQuoteDto,
  ) {
    return { success: true, data: await this.marketplaceService.respondToQuote(tenantId, id, dto) };
  }

  @Put('quotes/:id/accept')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Requester accepts an offered quote' })
  async acceptQuote(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.acceptQuote(tenantId, id) };
  }

  @Put('quotes/:id/reject')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Requester declines an open quote' })
  async rejectQuote(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.marketplaceService.rejectQuote(tenantId, id) };
  }
}
