import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Health probes. Callers: the image HEALTHCHECK, Caddy's active upstream check, the KVM host health
 * timer and external uptime monitors (infrastructure/kvm/README.md, "Monitoring").
 * - GET /api/v1/health        liveness: 200 while the process serves requests; reports database state and release
 * - GET /api/v1/health/ready  readiness: 200 only when the database answers, otherwise 503
 */
@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  /** Commit the image was built from (Dockerfile build argument UC_RELEASE); lets a cutover check prove which host answers. */
  private readonly release = (process.env.UC_RELEASE ?? '').trim().slice(0, 12) || 'unknown';

  constructor(private readonly prisma: PrismaService) {}

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
  @ApiOperation({ summary: 'Readiness probe (503 when the database is unreachable)' })
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503, not an unhandled 500: monitors and the proxy read it as "not ready", and a database outage
      // does not add an error log with a stack trace for every probe (several per minute).
      throw new ServiceUnavailableException('Database is not reachable');
    }
    return { status: 'ready', timestamp: new Date().toISOString() };
  }
}
