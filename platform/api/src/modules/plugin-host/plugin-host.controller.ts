import { BadRequestException, Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PluginHostService } from './plugin-host.service';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';

const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
const MAX_CONFIG_BYTES = 10 * 1024;

function assertPluginId(pluginId: string): string {
  if (typeof pluginId !== 'string' || !PLUGIN_ID.test(pluginId)) {
    throw new BadRequestException('Invalid plugin id');
  }
  return pluginId;
}

/** The install body is the plugin config: a plain JSON object of at most 10 KB. */
function assertPluginConfig(config: unknown): Record<string, unknown> {
  if (config === undefined || config === null) return {};
  if (typeof config !== 'object' || Array.isArray(config) || Object.getPrototypeOf(config) !== Object.prototype) {
    throw new BadRequestException('Plugin config must be a JSON object');
  }
  let json: string;
  try {
    json = JSON.stringify(config);
  } catch {
    throw new BadRequestException('Plugin config must be serializable JSON');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_CONFIG_BYTES) {
    throw new BadRequestException('Plugin config must not exceed 10 KB');
  }
  return JSON.parse(json) as Record<string, unknown>;
}

@ApiTags('plugins')
@Controller({ path: 'plugins', version: '1' })
@ApiBearerAuth()
export class PluginHostController {
  constructor(private readonly pluginHostService: PluginHostService) {}

  @Get()
  @RequirePermissions('core:tenant:read')
  @ApiOperation({ summary: 'List all registered plugins' })
  async list() {
    return { success: true, data: this.pluginHostService.listRegistered() };
  }

  @Post(':pluginId/install')
  @RequirePermissions('core:tenant:update')
  @ApiOperation({ summary: 'Install a plugin for the current tenant' })
  async install(
    @TenantId() tenantId: string,
    @Param('pluginId') pluginId: string,
    @Body() config: Record<string, unknown>,
  ) {
    const id = assertPluginId(pluginId);
    await this.pluginHostService.installForTenant(tenantId, id, assertPluginConfig(config));
    return { success: true, message: `Plugin '${id}' installed` };
  }

  @Delete(':pluginId')
  @RequirePermissions('core:tenant:update')
  @ApiOperation({ summary: 'Disable a plugin for the current tenant' })
  async disable(@TenantId() tenantId: string, @Param('pluginId') pluginId: string) {
    const id = assertPluginId(pluginId);
    await this.pluginHostService.disableForTenant(tenantId, id);
    return { success: true, message: `Plugin '${id}' disabled` };
  }
}
