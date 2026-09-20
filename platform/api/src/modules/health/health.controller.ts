import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { DATABASE_ROLE_QUERY, DatabaseRoleState, databaseRoleProblems } from './database-role';

/** True in production (HealthModule): readiness fails when the API's database login bypasses RLS. */
export const REQUIRE_RESTRICTED_DB_ROLE = 'HEALTH_REQUIRE_RESTRICTED_DB_ROLE';

/**
 * Health probes. Callers: the image HEALTHCHECK, Caddy's active upstream check, the KVM host health
 * timer, scripts/deploy.sh and external uptime monitors (infrastructure/kvm/README.md, "Monitoring").
 * - GET /api/v1/health        liveness: 200 while the process serves requests; reports database state and release
 * - GET /api/v1/health/ready  readiness: 200 only when the database answers and — in production — the API's
 *                             database login is the restricted runtime role, otherwise 503
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  /** Commit the image was built from (Dockerfile build argument UC_RELEASE); lets a cutover check prove which host answers. */
  private readonly release = (process.env.UC_RELEASE ?? '').trim().slice(0, 12) || 'unknown';
  /** Last role state logged, so a misconfiguration is logged once per change, not on every probe. */
  private lastRoleReport: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REQUIRE_RESTRICTED_DB_ROLE) private readonly requireRestrictedRole: boolean,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness + database connectivity check' })
  async health() {
    let db = 'unknown';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'connected';
    } catch {
      db = 'unreachable';
    }
    return {
      status: db === 'connected' ? 'ok' : 'degraded',
      service: 'umrah-connect-api',
      release: this.release,
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe (503 when the database is unreachable or, in production, the database role bypasses RLS)',
  })
  async ready() {
    let role: DatabaseRoleState | undefined;
    try {
      [role] = await this.prisma.$queryRaw<DatabaseRoleState[]>(DATABASE_ROLE_QUERY);
    } catch {
      // 503, not an unhandled 500: monitors and the proxy read it as "not ready", and a database outage
      // does not add an error log with a stack trace for every probe (several per minute).
      throw new ServiceUnavailableException('Database is not reachable');
    }
    if (!role) throw new ServiceUnavailableException('Database is not reachable');

    const problems = databaseRoleProblems(role);
    this.reportRole(role.role, problems);
    if (problems.length && this.requireRestrictedRole) {
      // A superuser, BYPASSRLS or owner login silently skips every Row-Level Security policy. Production
      // must never serve traffic like that: the deploy health check fails (and rolls back) and the proxy
      // takes the API out of rotation. The reason is in the log, not in this public response.
      throw new ServiceUnavailableException({
        code: 'DATABASE_ROLE_UNSAFE',
        message: 'The API database role check failed; see the API log.',
      });
    }
    return {
      status: 'ready',
      rowLevelSecurity: problems.length ? 'bypassed' : 'enforced',
      timestamp: new Date().toISOString(),
    };
  }

  private reportRole(name: string, problems: string[]) {
    const report = problems.join(', ');
    if (report === this.lastRoleReport) return;
    this.lastRoleReport = report;
    if (!report) {
      this.logger.log(`Database role "${name}" is restricted: Row-Level Security applies to the API`);
      return;
    }
    const message =
      `Database role "${name}" ${report}: Row-Level Security does NOT apply to the API. ` +
      'Connect as the runtime login (platform/api/prisma/rls/runtime-role.sql, docs/control-tower/RLS.md).';
    if (this.requireRestrictedRole) this.logger.error(`${message} Readiness answers 503.`);
    else this.logger.warn(message);
  }
}
