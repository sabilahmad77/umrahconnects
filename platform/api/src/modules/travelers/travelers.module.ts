import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { TravelersController } from './travelers.controller';
import { TravelerLinksService } from './traveler-links.service';
import { TravelerTripsService } from './traveler-trips.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TravelersController],
  providers: [TravelerLinksService, TravelerTripsService],
})
export class TravelersModule {}
