import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';

@Module({ imports: [PrismaModule], controllers: [TransportController], providers: [TransportService], exports: [TransportService] })
export class TransportModule {}
