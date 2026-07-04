import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId, CurrentUser } from '../../common/decorators/tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Register a new operator tenant' })
  async create(@Body() dto: CreateTenantDto) {
    const tenant = await this.tenantService.create(dto);
    return { success: true, data: tenant };
  }

  @Public()
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Resolve tenant by slug (public — used at login)' })
  async getBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findBySlug(slug);
    return { success: true, data: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status } };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current tenant details' })
  async getMyTenant(@TenantId() tenantId: string) {
    const tenant = await this.tenantService.findById(tenantId);
    return { success: true, data: tenant };
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Put('me')
  @ApiBearerAuth()
  @RequirePermissions('core:tenant:update')
  @ApiOperation({ summary: 'Update tenant profile' })
  async updateMyTenant(@TenantId() tenantId: string, @Body() dto: UpdateTenantDto) {
    const tenant = await this.tenantService.update(tenantId, dto);
    return { success: true, data: tenant };
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/kyc')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit KYC documents for verification' })
  async submitKyc(@TenantId() tenantId: string, @Body() body: any) {
    const result = await this.tenantService.submitKyc(tenantId, body);
    return { success: true, data: result };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/sub-agents')
  @ApiBearerAuth()
  @RequirePermissions('core:sub-agent:read')
  @ApiOperation({ summary: 'List sub-agents under this tenant' })
  async getSubAgents(@TenantId() tenantId: string) {
    const subAgents = await this.tenantService.getSubAgents(tenantId);
    return { success: true, data: subAgents };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/plugins')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List installed plugins for this tenant' })
  async getPlugins(@TenantId() tenantId: string) {
    const plugins = await this.tenantService.getInstalledPlugins(tenantId);
    return { success: true, data: plugins };
  }

  // Admin-only: get any tenant by ID
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get(':id')
  @ApiBearerAuth()
  @RequirePermissions('core:tenant:admin')
  @ApiOperation({ summary: '[Admin] Get tenant by ID' })
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    const tenant = await this.tenantService.findById(id);
    return { success: true, data: tenant };
  }
}
