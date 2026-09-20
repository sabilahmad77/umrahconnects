import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthController, REQUIRE_RESTRICTED_DB_ROLE } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      // Production readiness requires the restricted runtime login (R05); elsewhere a privileged
      // connection is only logged, so a developer database owned by the local user still works.
      provide: REQUIRE_RESTRICTED_DB_ROLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => config.get<string>('NODE_ENV') === 'production',
    },
  ],
})
export class HealthModule {}
