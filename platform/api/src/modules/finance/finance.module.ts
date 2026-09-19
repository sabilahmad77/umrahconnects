import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({ imports: [PrismaModule, NotificationsModule, PaymentsModule], controllers: [FinanceController], providers: [FinanceService], exports: [FinanceService] })
export class FinanceModule {}
