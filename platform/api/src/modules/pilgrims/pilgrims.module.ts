import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PilgrimsController } from './pilgrims.controller';
import { PilgrimsService } from './pilgrims.service';
import { PilgrimAccountLinksController } from './account-links/pilgrim-account-links.controller';
import { PilgrimAccountLinksService } from './account-links/pilgrim-account-links.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PilgrimsController, PilgrimAccountLinksController],
  providers: [PilgrimsService, PilgrimAccountLinksService],
  exports: [PilgrimsService],
})
export class PilgrimsModule {}
