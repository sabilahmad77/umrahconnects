import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { PilgrimPortalModule } from './pilgrim-portal.module';
export { PilgrimPortalService } from './pilgrim-portal.service';
export { PilgrimPortalController } from './pilgrim-portal.controller';

export const manifest: PluginManifest = {
  id: 'pilgrim-portal',
  version: '1.0.0',
  name: 'Pilgrim Self-Service Portal',
  description: 'Provides pilgrim-facing web portal endpoints: booking status, documents, itinerary, and notifications.',
  dependencies: ['core.tenant', 'crm', 'booking', 'group-ops'],
  phase: 'P2',
  provides: [
    { id: 'portal.pilgrim.access', description: 'Pilgrim-facing portal access token' },
  ],
  consumes: ['pilgrim.read', 'booking.read', 'group.read', 'pilgrim.document.read'],
  routePrefix: '/portal',
  dbSchema: 'plugin_pilgrim_portal',
};
