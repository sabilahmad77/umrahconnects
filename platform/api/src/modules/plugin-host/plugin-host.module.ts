import { Module } from '@nestjs/common';
import { PluginHostService } from './plugin-host.service';
import { PluginHostController } from './plugin-host.controller';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [PluginHostService],
  controllers: [PluginHostController],
  exports: [PluginHostService],
})
export class PluginHostModule {}
