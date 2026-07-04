import { Module } from '@nestjs/common';
import { GroupOpsController } from './group-ops.controller';
import { GroupOpsService } from './group-ops.service';

@Module({
  controllers: [GroupOpsController],
  providers: [GroupOpsService],
  exports: [GroupOpsService],
})
export class GroupOpsModule {}
