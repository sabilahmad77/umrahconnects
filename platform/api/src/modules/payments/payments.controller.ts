import {
  Controller, Get, Post, Body, Param, Req, Headers, ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateIntentDto, ConfirmIntentDto, RefundDto } from './dto/payment.dto';

@ApiTags('payments')
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  /**
   * Gateway callback. Public by necessity — authentication is the signature,
   * verified against the exact bytes the provider sent.
   */
  @Public()
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payment gateway webhook (signature-verified, idempotent)' })
  async webhook(
    @Param('provider') provider: string,
    @Req() req: any,
    @Headers('x-signature') xSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const raw: string = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? {});
    const data = await this.service.handleWebhook(provider, raw, xSignature ?? stripeSignature);
    return { success: true, data };
  }

  @ApiBearerAuth()
  @Get('providers')
  @RequirePermissions('finance:payment:read')
  async providers() {
    return { success: true, data: this.service.providerStatus() };
  }

  @ApiBearerAuth()
  @Post('intents')
  @RequirePermissions('finance:payment:process')
  async createIntent(
    @TenantId() tenantId: string, @CurrentUser() user: any, @Body() dto: CreateIntentDto,
  ) {
    return { success: true, data: await this.service.createIntent(tenantId, dto, user) };
  }

  @ApiBearerAuth()
  @Post('intents/:id/confirm')
  @RequirePermissions('finance:payment:process')
  async confirmIntent(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmIntentDto,
  ) {
    return { success: true, data: await this.service.confirmIntent(tenantId, id, dto?.scenario, user) };
  }

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
  @RequirePermissions('finance:payment:process')
  async refund(
    @TenantId() tenantId: string, @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundDto,
  ) {
    return { success: true, data: await this.service.refund(tenantId, id, dto?.amount, dto?.reason, user) };
  }
}
