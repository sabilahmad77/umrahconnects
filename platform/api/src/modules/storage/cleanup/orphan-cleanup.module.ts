import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { AuditModule } from '../../audit/audit.module';
import { StorageService } from '../storage.service';
import { OrphanCleanupService } from './orphan-cleanup.service';
import { ReferenceScanner } from './reference-scanner';

/**
 * The smallest application context the cleanup CLI needs: configuration, the
 * database, the audit log and the storage driver — no HTTP server, no guards.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    PrismaModule,
    AuditModule,
  ],
  providers: [StorageService, ReferenceScanner, OrphanCleanupService],
  exports: [OrphanCleanupService],
})
export class OrphanCleanupModule {}
