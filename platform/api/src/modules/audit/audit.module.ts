import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
