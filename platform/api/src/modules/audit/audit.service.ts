import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsService, TOPICS } from '../events/events.service';
import { AuditAction } from '@prisma/client';

export interface AuditLogDto {
  tenantId?: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  namespace: string;
  resource: string;
  resourceId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async log(dto: AuditLogDto): Promise<void> {
    try {
      // Write to Postgres (queryable audit log)
      const entry = await this.prisma.auditLog.create({
        data: {
          tenantId: dto.tenantId,
          actorId: dto.actorId,
          actorEmail: dto.actorEmail,
          action: (dto.action as AuditAction) ?? AuditAction.UPDATE,
          namespace: dto.namespace,
          resource: dto.resource,
          resourceId: dto.resourceId,
          beforeState: dto.beforeState ? JSON.parse(JSON.stringify(dto.beforeState)) : undefined,
          afterState: dto.afterState ? JSON.parse(JSON.stringify(dto.afterState)) : undefined,
          metadata: dto.metadata ? JSON.parse(JSON.stringify(dto.metadata)) : undefined,
          ipAddress: dto.ipAddress,
          userAgent: dto.userAgent,
          requestId: dto.requestId,
        },
      });

      // Also publish to Kafka for infinite-retention archival
      await this.events.publish(TOPICS.AUDIT_LOG, { ...dto, id: entry.id }, dto.tenantId);
    } catch (err) {
      // Audit failure is logged but never thrown — it must not disrupt the request
      this.logger.error(`Audit log write failed: ${(err as Error).message}`);
    }
  }

  async query(tenantId: string, filters: {
    actorId?: string;
    resource?: string;
    action?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 50, ...where } = filters;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: {
          tenantId,
          ...(where.actorId && { actorId: where.actorId }),
          ...(where.resource && { resource: where.resource }),
          ...(where.action && { action: where.action as AuditAction }),
          ...(where.from || where.to
            ? { occurredAt: { ...(where.from && { gte: where.from }), ...(where.to && { lte: where.to }) } }
            : {}),
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where: { tenantId } }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
