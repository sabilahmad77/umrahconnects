import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
