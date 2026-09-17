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
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import type { Principal } from '../auth/principal';
import { MarketplaceService } from './marketplace.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingDto } from './dto/query-listing.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
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
  @ApiOperation({ summary: 'Public listing search' })
  async findAllListings(@Query() query: QueryListingDto) {
    const data = await this.marketplaceService.findAllListings(query);
    return { success: true, data };
  }

  @Get('listings/mine')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: "Vendor's own listings (resolves vendor from tenant)" })
  async findMyListings(@TenantId() tenantId: string, @Query() query: any) {
    const vendor = await this.marketplaceService.findVendorForTenant(tenantId);
    const data = await this.marketplaceService.findAllListings({ ...query, vendorId: vendor.id, includeInactive: true });
    return { success: true, data };
  }

  @Get('listings/:id')
  @Public()
  @ApiOperation({ summary: 'Get listing detail' })
  async findOneListing(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.marketplaceService.findOneListing(id);
    return { success: true, data };
  }

  @Post('listings')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Vendor creates listing' })
  async createListing(@TenantId() tenantId: string, @Body() dto: CreateListingDto) {
    // The vendor must belong to the caller's organization; if omitted it is resolved from the tenant.
    const data = await this.marketplaceService.createListing(tenantId, dto);
    return { success: true, data };
  }

  @Put('listings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Update listing' })
  async updateListing(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    const data = await this.marketplaceService.updateListing(tenantId, id, dto);
    return { success: true, data };
  }

  @Delete('listings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive listing (soft-delete)' })
  async deactivateListing(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.marketplaceService.deactivateListing(tenantId, id);
    return { success: true, data };
  }

  // ── Inquiries ─────────────────────────────────────────────────────────────
  @Post('listings/:id/inquiries')
  @Public()
  @ApiOperation({ summary: 'Send inquiry on a listing (auth or anon)' })
  async createInquiry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateListingInquiryDto,
    @CurrentUser() user?: Principal,
  ) {
    const data = await this.marketplaceService.createInquiry(id, user?.sub ?? null, body);
    return { success: true, data };
  }

  @Get('listings/:id/inquiries')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List inquiries on a listing' })
  async listInquiries(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.marketplaceService.findOwnedListing(tenantId, id);
    const data = await this.marketplaceService.listInquiries({ listingId: id });
    return { success: true, data };
  }

  @Get('inquiries')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List inquiries received by my vendor' })
  async listMyInquiries(@TenantId() tenantId: string) {
    const vendor = await this.marketplaceService.findVendorForTenant(tenantId);
    const data = await this.marketplaceService.listInquiries({ vendorId: vendor.id });
    return { success: true, data };
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
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Create booking against a listing (the caller is the customer)' })
  async createBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: Principal,
    @Body() body: CreateListingBookingDto,
  ) {
    const data = await this.marketplaceService.createBooking(id, user.sub, body);
    return { success: true, data };
  }

  @Get('listings/:id/bookings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List bookings on a listing' })
  async listListingBookings(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.marketplaceService.findOwnedListing(tenantId, id);
    const data = await this.marketplaceService.listBookings({ listingId: id });
    return { success: true, data };
  }

  @Get('bookings')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List bookings received by my vendor' })
  async listMyBookings(@TenantId() tenantId: string) {
    const vendor = await this.marketplaceService.findVendorForTenant(tenantId);
    const data = await this.marketplaceService.listBookings({ vendorId: vendor.id });
    return { success: true, data };
  }

  @Get('bookings/mine')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'List bookings I placed as a customer/traveler' })
  async listMyTravelerBookings(@CurrentUser() user: Principal) {
    const data = await this.marketplaceService.listBookings({ userId: user.sub });
    return { success: true, data };
  }

  @Put('bookings/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Provider updates booking status / operational details' })
  async updateBooking(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateListingBookingDto,
  ) {
    const data = await this.marketplaceService.updateBooking(tenantId, id, body);
    return { success: true, data };
  }

  // ── Vendors ───────────────────────────────────────────────────────────────────

  @Get('vendors')
  @Public()
  @ApiOperation({ summary: 'List vendors (public discovery)' })
  async findAllVendors(
    @Query('type') type?: string,
    @Query('city') city?: string,
  ) {
    const data = await this.marketplaceService.findAllVendors(type, city);
    return { success: true, data };
  }

  @Get('vendors/mine')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'Get/create my vendor record' })
  async findMyVendor(@TenantId() tenantId: string) {
    const data = await this.marketplaceService.findVendorForTenant(tenantId);
    return { success: true, data };
  }

  @Post('vendors')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Register as vendor' })
  async createVendor(@TenantId() tenantId: string, @Body() dto: CreateVendorDto) {
    const data = await this.marketplaceService.createVendor(tenantId, dto);
    return { success: true, data };
  }

  @Get('vendors/:id')
  @Public()
  @ApiOperation({ summary: 'Get vendor profile with listings' })
  async findOneVendor(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.marketplaceService.findOneVendor(id);
    return { success: true, data };
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
  @ApiOperation({ summary: 'Request a quote for a listing' })
  async createQuote(@TenantId() tenantId: string, @Body() dto: CreateQuoteDto) {
    const data = await this.marketplaceService.createQuote(tenantId, dto);
    return { success: true, data };
  }

  @Get('quotes')
  @RequirePermissions('marketplace:listing:read')
  @ApiOperation({ summary: 'List my quote requests' })
  async findMyQuotes(@TenantId() tenantId: string) {
    const data = await this.marketplaceService.findMyQuotes(tenantId);
    return { success: true, data };
  }

  @Put('quotes/:id')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Vendor responds to quote' })
  async respondToQuote(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondQuoteDto,
  ) {
    const data = await this.marketplaceService.respondToQuote(tenantId, id, dto);
    return { success: true, data };
  }

  @Put('quotes/:id/accept')
  @RequirePermissions('marketplace:listing:manage')
  @ApiOperation({ summary: 'Accept quote' })
  async acceptQuote(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.marketplaceService.acceptQuote(tenantId, id);
    return { success: true, data };
  }
}
