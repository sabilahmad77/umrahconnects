import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PluginHostService } from './plugin-host.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('plugins')
@Controller({ path: 'plugins', version: '1' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PluginHostController {
  constructor(private readonly pluginHostService: PluginHostService) {}

  @Get()
  @ApiOperation({ summary: 'List all registered plugins' })
  async list() {
    return { success: true, data: this.pluginHostService.listRegistered() };
  }

  @Post(':pluginId/install')
  @ApiOperation({ summary: 'Install a plugin for the current tenant' })
  async install(
    @TenantId() tenantId: string,
    @Param('pluginId') pluginId: string,
    @Body() config: Record<string, unknown>,
  ) {
    await this.pluginHostService.installForTenant(tenantId, pluginId, config);
    return { success: true, message: `Plugin '${pluginId}' installed` };
  }

  @Delete(':pluginId')
  @ApiOperation({ summary: 'Disable a plugin for the current tenant' })
  async disable(@TenantId() tenantId: string, @Param('pluginId') pluginId: string) {
    await this.pluginHostService.disableForTenant(tenantId, pluginId);
    return { success: true, message: `Plugin '${pluginId}' disabled` };
  }
}
