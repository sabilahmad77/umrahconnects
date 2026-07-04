import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { BookingModule } from './booking.module';
export { BookingService } from './booking.service';
export { BookingController } from './booking.controller';

export const manifest: PluginManifest = {
  id: 'booking',
  version: '1.0.0',
  name: 'Booking & Package Engine',
  description: 'Manages Umrah/Hajj packages, bookings, and pilgrim-to-booking associations.',
  dependencies: ['core.tenant', 'crm'],
  phase: 'P1',
  provides: [
    { id: 'package.read', description: 'Read package definitions' },
    { id: 'package.write', description: 'Create and manage packages' },
    { id: 'booking.read', description: 'Read booking records' },
    { id: 'booking.write', description: 'Create and manage bookings' },
  ],
  consumes: ['pilgrim.read'],
  routePrefix: '/plugins/booking',
  dbSchema: 'plugin_booking',
};
