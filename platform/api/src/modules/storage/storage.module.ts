import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { DocumentsController } from './documents.controller';
import { DocumentAccessService } from './document-access.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [DocumentsController],
  providers: [StorageService, DocumentAccessService],
  exports: [StorageService, DocumentAccessService],
})
export class StorageModule {}
