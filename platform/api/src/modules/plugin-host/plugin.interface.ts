// Formal Plugin SDK Contract for Umrah Connects
// Every plugin implements this interface and registers with the PluginHostService.

export interface PluginManifest {
  id: string;              // Unique identifier: 'crm', 'booking', 'social', etc.
  version: string;         // SemVer: '1.0.0'
  name: string;            // Human name: 'Pilgrim CRM'
  description?: string;
  dependencies: string[];  // Other plugin IDs this plugin requires
  phase: 'P1' | 'P1.5' | 'P2' | 'P3';

  // Capabilities this plugin provides (other plugins can consume these)
  provides: PluginCapability[];
  // Capabilities this plugin consumes from other plugins
  consumes: string[];

  // JSON Schema for tenant-level configuration
  configSchema?: Record<string, unknown>;

  // UI slots this plugin registers
  uiSlots?: PluginUiSlot[];

  // API route prefix this plugin owns
  routePrefix?: string;   // e.g. '/plugins/crm'

  // DB schema namespace
  dbSchema?: string;      // e.g. 'plugin_crm'
}

export interface PluginCapability {
  id: string;           // 'pilgrim.read', 'booking.create', etc.
  description: string;
}

export interface PluginUiSlot {
  slotId: string;       // 'sidebar.nav', 'dashboard.widget', etc.
  component: string;    // Component name registered in the UI plugin registry
  order?: number;
}

export interface PluginLifecycleHooks {
  onInstall?: (tenantId: string, config: Record<string, unknown>) => Promise<void>;
  onEnable?: (tenantId: string) => Promise<void>;
  onDisable?: (tenantId: string) => Promise<void>;
  onUpgrade?: (tenantId: string, fromVersion: string, toVersion: string) => Promise<void>;
  onUninstall?: (tenantId: string) => Promise<void>;
}

// Every platform plugin implements this interface
export interface IPlugin {
  manifest: PluginManifest;
  hooks?: PluginLifecycleHooks;
}

// Plugin event published to the event bus
export interface PluginEvent<T = unknown> {
  eventId: string;
  pluginId: string;
  tenantId: string;
  eventType: string;    // 'crm.pilgrim.created', 'booking.booking.confirmed', etc.
  payload: T;
  occurredAt: Date;
  correlationId?: string;
}
