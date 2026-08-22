import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { VisaRequestsController } from './visa-requests.controller';
import { VisaRequestsService } from './visa-requests.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule],
  controllers: [VisaRequestsController],
  providers: [VisaRequestsService],
  exports: [VisaRequestsService],
})
export class VisaRequestsModule {}
