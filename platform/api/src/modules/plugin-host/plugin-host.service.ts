import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { IPlugin, PluginManifest, PluginEvent } from './plugin.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class PluginHostService {
  private readonly logger = new Logger(PluginHostService.name);
  private readonly registry = new Map<string, IPlugin>();

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  // Called at app startup to register a plugin with the host
  register(plugin: IPlugin): void {
    if (this.registry.has(plugin.manifest.id)) {
      this.logger.warn(`Plugin '${plugin.manifest.id}' re-registered — overwriting`);
    }
    this.registry.set(plugin.manifest.id, plugin);
    this.logger.log(`Plugin registered: ${plugin.manifest.id} v${plugin.manifest.version}`);
  }

  getManifest(pluginId: string): PluginManifest {
    const plugin = this.registry.get(pluginId);
    if (!plugin) throw new NotFoundException(`Plugin '${pluginId}' not registered`);
    return plugin.manifest;
  }

  listRegistered(): PluginManifest[] {
    return Array.from(this.registry.values()).map((p) => p.manifest);
  }

  async installForTenant(tenantId: string, pluginId: string, config: Record<string, unknown> = {}) {
    const plugin = this.registry.get(pluginId);
    if (!plugin) throw new NotFoundException(`Plugin '${pluginId}' not found`);

    const existing = await this.prisma.tenantPlugin.findUnique({
      where: { tenantId_pluginId: { tenantId, pluginId } },
    });
    if (existing?.enabled) throw new ConflictException(`Plugin '${pluginId}' already installed`);

    // Verify dependencies are installed
    for (const dep of plugin.manifest.dependencies) {
      const depInstall = await this.prisma.tenantPlugin.findUnique({
        where: { tenantId_pluginId: { tenantId, pluginId: dep } },
      });
      if (!depInstall?.enabled) {
        throw new ConflictException(`Dependency plugin '${dep}' must be installed first`);
      }
    }

    await this.prisma.tenantPlugin.upsert({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      create: { tenantId, pluginId, version: plugin.manifest.version, config: config as any, enabled: true },
      update: { enabled: true, config: config as any, version: plugin.manifest.version },
    });

    if (plugin.hooks?.onInstall) {
      await plugin.hooks.onInstall(tenantId, config);
    }

    await this.emit(tenantId, pluginId, 'plugin.installed', { pluginId, version: plugin.manifest.version });
    this.logger.log(`Plugin '${pluginId}' installed for tenant ${tenantId}`);
  }

  async disableForTenant(tenantId: string, pluginId: string) {
    const plugin = this.registry.get(pluginId);
    await this.prisma.tenantPlugin.update({
      where: { tenantId_pluginId: { tenantId, pluginId } },
      data: { enabled: false },
    });
    if (plugin?.hooks?.onDisable) {
      await plugin.hooks.onDisable(tenantId);
    }
    this.logger.log(`Plugin '${pluginId}' disabled for tenant ${tenantId}`);
  }

  async isEnabledForTenant(tenantId: string, pluginId: string): Promise<boolean> {
    const install = await this.prisma.tenantPlugin.findUnique({
      where: { tenantId_pluginId: { tenantId, pluginId } },
    });
    return install?.enabled ?? false;
  }

  async getTenantConfig(tenantId: string, pluginId: string): Promise<Record<string, unknown>> {
    const install = await this.prisma.tenantPlugin.findUnique({
      where: { tenantId_pluginId: { tenantId, pluginId } },
    });
    return (install?.config as Record<string, unknown>) ?? {};
  }

  // Emit a domain event to the platform event bus
  async emit<T>(tenantId: string, pluginId: string, eventType: string, payload: T): Promise<void> {
    const event: PluginEvent<T> = {
      eventId: randomUUID(),
      pluginId,
      tenantId,
      eventType,
      payload,
      occurredAt: new Date(),
    };
    await this.events.publish(`plugin.${pluginId}`, event);
  }
}
