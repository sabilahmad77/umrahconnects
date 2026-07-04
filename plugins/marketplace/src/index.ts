import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { MarketplaceModule } from './marketplace.module';
export { MarketplaceService } from './marketplace.service';
export { MarketplaceController } from './marketplace.controller';

export const manifest: PluginManifest = {
  id: 'marketplace',
  version: '1.0.0',
  name: 'Vendor Marketplace',
  description: 'Connects Umrah operators with vendors for services: hotels, transport, catering. Supports listings, RFQ, quotes, and ratings.',
  dependencies: ['core.tenant'],
  phase: 'P3',
  provides: [
    { id: 'marketplace.vendor.read', description: 'Browse vendors and listings' },
    { id: 'marketplace.rfq', description: 'Submit and manage quote requests' },
    { id: 'marketplace.rating.write', description: 'Submit vendor ratings' },
  ],
  consumes: [],
  routePrefix: '/plugins/marketplace',
  dbSchema: 'plugin_marketplace',
};
