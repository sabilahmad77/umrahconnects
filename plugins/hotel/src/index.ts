import { PluginManifest } from '../../shared/plugin-manifest.interface';
export { HotelModule } from './hotel.module';
export { HotelService } from './hotel.service';
export { HotelController } from './hotel.controller';

export const manifest: PluginManifest = {
  id: 'hotel',
  version: '1.0.0',
  name: 'Hotel Inventory & Allocation',
  description: 'Manages hotels, room types, allotment blocks, and pilgrim room assignments.',
  dependencies: ['core.tenant', 'booking'],
  phase: 'P1',
  provides: [
    { id: 'hotel.read', description: 'Read hotel and room inventory' },
    { id: 'hotel.write', description: 'Manage hotel properties and allotments' },
    { id: 'room.assign', description: 'Assign pilgrims to rooms' },
  ],
  consumes: ['booking.read'],
  routePrefix: '/plugins/hotel',
  dbSchema: 'plugin_hotel',
};
