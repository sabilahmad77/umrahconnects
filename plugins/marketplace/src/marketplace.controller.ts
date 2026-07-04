import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketplaceService, CreateListingDto, Vendor, QuoteRequest } from './marketplace.service';
import { JwtAuthGuard } from '../../../core/src/auth/jwt-auth.guard';

@ApiTags('Marketplace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('plugins/marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  // ── Vendors ───────────────────────────────────────────────────────────────

  @Get('vendors')
  @ApiOperation({ summary: 'Browse vendor marketplace' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'verified', required: false })
  listVendors(
    @Query('category') category?: Vendor['category'],
    @Query('city') city?: string,
    @Query('verified') verified?: boolean,
  ) {
    return this.marketplaceService.listVendors({ category, city, verified });
  }

  @Get('vendors/:id')
  @ApiOperation({ summary: 'Get vendor profile' })
  getVendor(@Param('id') id: string) {
    return this.marketplaceService.getVendor(id);
  }

  @Get('vendors/:id/ratings')
  @ApiOperation({ summary: 'Get vendor ratings' })
  getVendorRatings(@Param('id') id: string) {
    return this.marketplaceService.getVendorRatings(id);
  }

  @Post('vendors/:id/rate')
  @ApiOperation({ summary: 'Rate a vendor' })
  rateVendor(
    @Request() req: any,
    @Param('id') vendorId: string,
    @Body('score') score: number,
    @Body('review') review?: string,
  ) {
    return this.marketplaceService.rateVendor(req.user.tenantId, vendorId, req.user.userId, score, review);
  }

  // ── Listings ──────────────────────────────────────────────────────────────

  @Get('listings')
  @ApiOperation({ summary: 'Browse service listings' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'vendorId', required: false })
  listListings(
    @Query('category') category?: Vendor['category'],
    @Query('vendorId') vendorId?: string,
  ) {
    return this.marketplaceService.listListings({ category, vendorId });
  }

  @Get('listings/:id')
  @ApiOperation({ summary: 'Get a listing' })
  getListing(@Param('id') id: string) {
    return this.marketplaceService.getListing(id);
  }

  @Post('listings')
  @ApiOperation({ summary: 'Create a vendor listing' })
  createListing(@Body() dto: CreateListingDto) {
    return this.marketplaceService.createListing(dto);
  }

  @Patch('listings/:id')
  @ApiOperation({ summary: 'Update a listing' })
  updateListing(@Param('id') id: string, @Body() dto: Partial<CreateListingDto>) {
    return this.marketplaceService.updateListing(id, dto);
  }

  // ── Quotes / RFQ ──────────────────────────────────────────────────────────

  @Post('listings/:listingId/request-quote')
  @ApiOperation({ summary: 'Request a quote for a listing' })
  requestQuote(
    @Request() req: any,
    @Param('listingId') listingId: string,
    @Body('requirements') requirements: string,
    @Body('pilgrimCount') pilgrimCount?: number,
    @Body('dateFrom') dateFrom?: string,
    @Body('dateTo') dateTo?: string,
  ) {
    return this.marketplaceService.requestQuote(
      req.user.tenantId,
      listingId,
      req.user.userId,
      requirements,
      {
        pilgrimCount,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
      },
    );
  }

  @Get('quote-requests')
  @ApiOperation({ summary: 'List quote requests for tenant' })
  @ApiQuery({ name: 'status', required: false })
  listQuoteRequests(
    @Request() req: any,
    @Query('status') status?: QuoteRequest['status'],
  ) {
    return this.marketplaceService.listQuoteRequests(req.user.tenantId, { status });
  }

  @Post('quotes/:id/accept')
  @ApiOperation({ summary: 'Accept a vendor quote' })
  acceptQuote(@Request() req: any, @Param('id') id: string) {
    return this.marketplaceService.acceptQuote(req.user.tenantId, id);
  }
}
