import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { CrmModule } from './crm.module';
export { CrmService } from './crm.service';
export { CrmController } from './crm.controller';

export const manifest: PluginManifest = {
  id: 'crm',
  version: '1.0.0',
  name: 'Pilgrim CRM',
  description: 'Manages pilgrims, family groups, and associated documents for Umrah/Hajj operators.',
  dependencies: ['core.tenant'],
  phase: 'P1',
  provides: [
    { id: 'pilgrim.read', description: 'Read pilgrim profiles and family groups' },
    { id: 'pilgrim.write', description: 'Create and update pilgrim profiles' },
    { id: 'pilgrim.document.read', description: 'Read pilgrim documents' },
    { id: 'pilgrim.document.write', description: 'Upload and manage pilgrim documents' },
  ],
  consumes: [],
  routePrefix: '/plugins/crm',
  dbSchema: 'plugin_crm',
};
