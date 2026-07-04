import { Module } from '@nestjs/common';
import { VisaController } from './visa.controller';
import { VisaService } from './visa.service';

@Module({
  controllers: [VisaController],
  providers: [VisaService],
  exports: [VisaService],
})
export class VisaModule {}
