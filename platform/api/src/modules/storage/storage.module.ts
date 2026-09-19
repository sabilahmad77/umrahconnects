import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { DocumentsController } from './documents.controller';
import { DocumentAccessService } from './document-access.service';
import { MediaRegistryService } from './media-registry.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [DocumentsController],
  providers: [StorageService, DocumentAccessService, MediaRegistryService],
  exports: [StorageService, DocumentAccessService, MediaRegistryService],
})
export class StorageModule {}
