import { Controller, Get, Post, Put, Body, Param, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AllowPendingTenant } from '../../common/decorators/access.decorator';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TenantKycSubmissionDto } from '../admin/dto/admin.dto';
import type { Principal } from '../auth/principal';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller({ path: 'tenants', version: '1' })
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /** Platform administrators create organizations directly; everyone else uses /onboarding/organization. */
  @Post()
  @RequirePermissions('platform:tenant:manage')
  @ApiOperation({ summary: '[Platform] Create an organization' })
  async create(@CurrentUser() user: Principal, @Body() dto: CreateTenantDto) {
    return { success: true, data: await this.tenantService.create(dto, user) };
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Resolve an active organization by slug (public, minimal)' })
  async getBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findActiveBySlug(slug);
    return { success: true, data: { id: tenant.id, name: tenant.name, slug: tenant.slug } };
  }

  @Get('me')
  @RequirePermissions('core:tenant:read')
  @AllowPendingTenant()
  @ApiOperation({ summary: 'Current organization' })
  async getMyTenant(@TenantId() tenantId: string) {
    return { success: true, data: TenantService.ownView(await this.tenantService.findById(tenantId)) };
  }

  @Put('me')
  @RequirePermissions('core:tenant:update')
  @AllowPendingTenant()
  @ApiOperation({ summary: 'Update the current organization profile' })
  async updateMyTenant(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    return { success: true, data: TenantService.ownView(await this.tenantService.update(tenantId, dto)) };
  }

  @Post('me/kyc')
  @RequirePermissions('core:tenant:update')
  @AllowPendingTenant()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit KYC for platform review' })
  async submitKyc(@CurrentUser() user: Principal, @Body() body: TenantKycSubmissionDto) {
    return { success: true, data: await this.tenantService.submitKyc(user, body) };
  }

  @Get('me/kyc')
  @RequirePermissions('core:tenant:read')
  @AllowPendingTenant()
  @ApiOperation({ summary: 'KYC submissions of the current organization' })
  async myKyc(@TenantId() tenantId: string) {
    return { success: true, data: await this.tenantService.kycHistory(tenantId) };
  }

  @Get('me/sub-agents')
  @RequirePermissions('core:sub-agent:read')
  @ApiOperation({ summary: 'Sub-agents under the current organization' })
  async getSubAgents(@TenantId() tenantId: string) {
    return { success: true, data: await this.tenantService.getSubAgents(tenantId) };
  }

  @Get('me/plugins')
  @RequirePermissions('core:tenant:read')
  @ApiOperation({ summary: 'Installed plugins for the current organization' })
  async getPlugins(@TenantId() tenantId: string) {
    return { success: true, data: await this.tenantService.getInstalledPlugins(tenantId) };
  }

  @Get(':id')
  @RequirePermissions('platform:tenant:read')
  @ApiOperation({ summary: '[Platform] Organization by id' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.tenantService.findById(id) };
  }
}
