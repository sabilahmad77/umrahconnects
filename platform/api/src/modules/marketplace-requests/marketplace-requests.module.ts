import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketplaceRequestsController } from './marketplace-requests.controller';
import { MarketplaceRequestsService } from './marketplace-requests.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [MarketplaceRequestsController],
  providers: [MarketplaceRequestsService],
  exports: [MarketplaceRequestsService],
})
export class MarketplaceRequestsModule {}
