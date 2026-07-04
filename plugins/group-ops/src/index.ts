import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { GroupOpsModule } from './group-ops.module';
export { GroupOpsService } from './group-ops.service';
export { GroupOpsController } from './group-ops.controller';

export const manifest: PluginManifest = {
  id: 'group-ops',
  version: '1.0.0',
  name: 'Group Operations',
  description: 'Manages trip groups, itineraries, mutawif assignments, and incident reporting during pilgrimage operations.',
  dependencies: ['core.tenant', 'booking', 'crm'],
  phase: 'P2',
  provides: [
    { id: 'group.read', description: 'Read trip groups and itineraries' },
    { id: 'group.write', description: 'Manage trip groups and mutawif assignments' },
    { id: 'incident.write', description: 'Log and manage incidents' },
  ],
  consumes: ['booking.read', 'pilgrim.read'],
  routePrefix: '/plugins/group-ops',
  dbSchema: 'plugin_group_ops',
};
