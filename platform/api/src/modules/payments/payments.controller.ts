import {
  Controller, Get, Post, Body, Param, Req, Headers, ParseUUIDPipe, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { RbacService } from '../rbac/rbac.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AnyAuthenticated } from '../../common/decorators/access.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateIntentDto, ConfirmIntentDto, RefundDto, CheckoutDto } from './dto/payment.dto';
import type { Principal } from '../auth/principal';

/** Who may see which gateway settings are missing (deployment detail), not just whether one is configured. */
const CONFIG_DETAIL_CAPABILITIES = ['finance:payment:process', 'platform:settings:read'];

@ApiTags('payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(
    private readonly service: PaymentsService,
    private readonly rbac: RbacService,
  ) {}

  /**
   * Gateway callback. Public by necessity — authentication is the signature,
   * verified against the exact bytes the provider sent.
   */
  @Public()
  @SkipThrottle()
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payment gateway webhook (signature-verified, idempotent)' })
  async webhook(
    @Param('provider') provider: string,
    @Req() req: any,
    @Headers('x-signature') xSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    // Without the exact bytes no signature can be checked: refuse, so the
    // provider shows a failed delivery and retries instead of believing it landed.
    // An empty body cannot carry an event either (F18): refuse it the same way.
    if (!req.rawBody?.length) {
      throw new BadRequestException('Webhook body must be a non-empty application/json payload');
    }
    const raw: string = req.rawBody.toString('utf8');
    const data = await this.service.handleWebhook(provider, raw, stripeSignature ?? xSignature);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Get('providers')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Active payment provider and its public configuration',
    description:
      'Everyone signed in sees whether each provider is configured; the names of missing settings are returned only to holders of finance:payment:process or platform:settings:read.',
  })
  async providers(@Req() req: any) {
    const granted = await this.rbac.permissionsFor(req);
    const detail = CONFIG_DETAIL_CAPABILITIES.some((c) => granted.has(c));
    return { success: true, data: this.service.providerStatus(detail) };
  }

  // ── Organization staff ──────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('intents')
  @RequirePermissions('finance:payment:process')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createIntent(@TenantId() tenantId: string, @CurrentUser() user: Principal, @Body() dto: CreateIntentDto) {
    return { success: true, data: await this.service.createIntent(tenantId, dto, user) };
  }

  @ApiBearerAuth()
  @Post('intents/:id/confirm')
  @RequirePermissions('finance:payment:process')
  async confirmIntent(
    @TenantId() tenantId: string, @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmIntentDto,
  ) {
    return { success: true, data: await this.service.confirmIntent(tenantId, id, dto?.scenario, user) };
  }

  @ApiBearerAuth()
  @Post('intents/:id/resume')
  @RequirePermissions('finance:payment:process')
  @ApiOperation({ summary: 'Continue an open card attempt (returns its client secret while it can still be paid)' })
  async resumeIntent(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.resumeIntent(tenantId, id) };
  }

  @ApiBearerAuth()
  @Post('intents/:id/cancel')
  @RequirePermissions('finance:payment:process')
  @ApiOperation({ summary: 'Cancel an open payment attempt at the provider and release its reservation' })
  async cancelIntent(
    @TenantId() tenantId: string, @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.service.cancelIntent(tenantId, id, user) };
  }

  // ── Traveler checkout ───────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('checkout')
  @AnyAuthenticated()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Pay your own marketplace booking (amount decided by the server)' })
  async checkout(@CurrentUser() user: Principal, @Body() dto: CheckoutDto) {
    return { success: true, data: await this.service.createCheckout(user, dto.listingBookingId) };
  }

  @ApiBearerAuth()
  @Get('checkout/:id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Status of your own checkout (reconciled with the provider)' })
  async checkoutStatus(@CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.checkoutStatus(user, id) };
  }

  @ApiBearerAuth()
  @Post('checkout/:id/sandbox-complete')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Development only: complete a sandbox checkout' })
  async sandboxComplete(
    @CurrentUser() user: Principal, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmIntentDto,
  ) {
    return { success: true, data: await this.service.completeSandboxCheckout(user, id, dto?.scenario) };
  }

  // ── Reads & refunds ─────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Get(':id')
  @RequirePermissions('finance:payment:read')
  async findOne(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.findOne(tenantId, id) };
  }

  @ApiBearerAuth()
  @Get(':id/transactions')
  @RequirePermissions('finance:payment:read')
  async transactions(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.transactions(tenantId, id) };
  }

  @ApiBearerAuth()
  @Post(':id/refund')
  @RequirePermissions('finance:payment:refund')
  async refund(
    @TenantId() tenantId: string, @CurrentUser() user: Principal,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto,
  ) {
    return { success: true, data: await this.service.refund(tenantId, id, dto?.amount, dto?.reason, user) };
  }
}
