import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { AccessPolicyCheck } from './access-policy.check';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [RbacService, AccessPolicyCheck],
  controllers: [RbacController],
  exports: [RbacService, AccessPolicyCheck],
})
export class RbacModule {}
