import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/guards/throttler.guard';
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
import { StorageModule } from './modules/storage/storage.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { VisaRequestsModule } from './modules/visa-requests/visa-requests.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MarketplaceRequestsModule } from './modules/marketplace-requests/marketplace-requests.module';
import { AdminModule } from './modules/admin/admin.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    // Config (loaded first)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      // Production configuration comes from the process environment only.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),

    // Rate limiting. `default` is per client IP (see TRUST_PROXY); `account`
    // is keyed by IP + submitted email and only bites where a route sets it.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: Number(config.get<string>('THROTTLE_TTL_MS', '60000')),
            limit: Number(config.get<string>('THROTTLE_LIMIT', '600')),
            getTracker: (req: Record<string, any>) => req.clientIp ?? req.ip,
          },
          {
            name: 'account',
            ttl: 60_000,
            limit: Number.MAX_SAFE_INTEGER,
            getTracker: (req: Record<string, any>) =>
              `${req.clientIp ?? req.ip}|${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 255)}`,
          },
        ],
        skipIf: () => config.get<string>('THROTTLE_DISABLED') === 'true',
      }),
    }),

    // Core infrastructure
    PrismaModule,
    AuditModule,
    EventsModule,
    MailModule,

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
    PaymentsModule,
    StorageModule,
    ComplianceModule,
    VisaRequestsModule,
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
    // Order matters: rate limit → authenticate → authorize (deny-by-default).
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
