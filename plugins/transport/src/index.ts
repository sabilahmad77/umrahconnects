import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { TransportModule } from './transport.module';
export { TransportService } from './transport.service';
export { TransportController } from './transport.controller';

export const manifest: PluginManifest = {
  id: 'transport',
  version: '1.0.0',
  name: 'Transport & Ground Logistics',
  description: 'Manages vehicles, drivers, routes, pilgrim transport assignments, and Tasreeh permits.',
  dependencies: ['core.tenant', 'booking'],
  phase: 'P2',
  provides: [
    { id: 'transport.read', description: 'Read transport schedules and assignments' },
    { id: 'transport.write', description: 'Manage vehicles, drivers, and routes' },
    { id: 'transport.tasreeh', description: 'Manage Tasreeh permit workflows' },
  ],
  consumes: ['booking.read', 'pilgrim.read'],
  routePrefix: '/plugins/transport',
  dbSchema: 'plugin_transport',
};
