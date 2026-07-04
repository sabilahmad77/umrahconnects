import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PilgrimsController } from './pilgrims.controller';
import { PilgrimsService } from './pilgrims.service';

@Module({
  imports: [PrismaModule],
  controllers: [PilgrimsController],
  providers: [PilgrimsService],
  exports: [PilgrimsService],
})
export class PilgrimsModule {}
