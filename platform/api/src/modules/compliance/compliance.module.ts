import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { VisaDocumentsService } from './visa-documents.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, VisaDocumentsService],
  exports: [ComplianceService, VisaDocumentsService],
})
export class ComplianceModule {}
