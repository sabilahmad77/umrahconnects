import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReferenceNumberService } from './reference-number.service';

/**
 * Reference numbers are plumbing every feature module needs (bookings, finance,
 * compliance, marketplace requests), so it is global rather than imported four
 * times. See reference-number.service.ts.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ReferenceNumberService],
  exports: [ReferenceNumberService],
})
export class ReferencesModule {}
