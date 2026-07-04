import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { VisaModule } from './visa.module';
export { VisaService } from './visa.service';
export { VisaController } from './visa.controller';

export const manifest: PluginManifest = {
  id: 'visa',
  version: '1.0.0',
  name: 'Visa & Compliance',
  description: 'Manages visa applications, regulatory submissions to Nusuk/SISKOPATUH, and document workflows.',
  dependencies: ['core.tenant', 'crm', 'booking'],
  phase: 'P1',
  provides: [
    { id: 'visa.read', description: 'Read visa application status' },
    { id: 'visa.write', description: 'Create and update visa applications' },
    { id: 'visa.submit', description: 'Submit visa applications to regulatory bodies' },
  ],
  consumes: ['pilgrim.read', 'booking.read', 'pilgrim.document.read'],
  routePrefix: '/plugins/visa',
  dbSchema: 'plugin_visa',
};
