import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { PluginHostModule } from './modules/plugin-host/plugin-host.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';
import { PilgrimsModule } from './modules/pilgrims/pilgrims.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { GroupsModule } from './modules/groups/groups.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { SocialModule } from './modules/social/social.module';
import { TransportModule } from './modules/transport/transport.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MarketplaceRequestsModule } from './modules/marketplace-requests/marketplace-requests.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { HealthModule } from './modules/health/health.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    // Config (loaded first)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          name: 'short',
          ttl: 1000,
          limit: config.get<number>('THROTTLE_SHORT_LIMIT', 10),
        },
        {
          name: 'medium',
          ttl: 10000,
          limit: config.get<number>('THROTTLE_MEDIUM_LIMIT', 50),
        },
        {
          name: 'long',
          ttl: 60000,
          limit: config.get<number>('THROTTLE_LONG_LIMIT', 200),
        },
      ],
    }),

    // Core infrastructure
    PrismaModule,
    AuditModule,
    EventsModule,

    // Platform modules
    AuthModule,
    TenantModule,
    RbacModule,
    PluginHostModule,

    // Feature modules
    PilgrimsModule,
    BookingsModule,
    HotelsModule,
    GroupsModule,
    MarketplaceModule,
    SocialModule,
    TransportModule,
    FinanceModule,
    ComplianceModule,
    ReportsModule,
    NotificationsModule,
    ConnectionsModule,
    MarketplaceRequestsModule,
    AdminModule,
    UploadsModule,
    InquiriesModule,
    HealthModule,
  ],
  providers: [
    // Register guards globally so every controller has them without re-importing
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .exclude(
        { path: 'api/v1/auth/(.*)', method: RequestMethod.ALL },
        { path: 'api/health', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
