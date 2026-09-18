import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

/** Global so the notification and mail paths can consult preferences without new module wiring. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
