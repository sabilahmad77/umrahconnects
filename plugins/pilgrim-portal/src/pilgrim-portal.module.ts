import { Module } from '@nestjs/common';
import { PilgrimPortalController } from './pilgrim-portal.controller';
import { PilgrimPortalService } from './pilgrim-portal.service';

@Module({
  controllers: [PilgrimPortalController],
  providers: [PilgrimPortalService],
  exports: [PilgrimPortalService],
})
export class PilgrimPortalModule {}
