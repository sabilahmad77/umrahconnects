import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  VisaRequestStatus,
  VisaRequestPriority,
  VisaRequestCategory,
  VisaRequestNoteVisibility,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateVisaRequestDto, UpdateVisaRequestDto, QueryVisaRequestDto,
  AddNoteDto, EscalateDto, ResolveDto, CloseDto, ReopenDto, ChangeStatusDto,
} from './dto/visa-request.dto';

/** Actor context threaded through every mutation for timeline + audit. */
export interface Actor {
  sub?: string;
  email?: string;
  tenantId?: string;
}

const OPEN_STATUSES: VisaRequestStatus[] = [
  VisaRequestStatus.OPEN,
  VisaRequestStatus.IN_PROGRESS,
  VisaRequestStatus.WAITING_ON_CUSTOMER,
  VisaRequestStatus.ESCALATED,
];

const TERMINAL_STATUSES: VisaRequestStatus[] = [
  VisaRequestStatus.RESOLVED,
  VisaRequestStatus.CLOSED,
];

@Injectable()
export class VisaRequestsService {
  private readonly logger = new Logger(VisaRequestsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Tenant-scoped fetch. `id` is guarded because a `findFirst` with an
   * undefined id silently matches the first row of the table.
   */
  private async mustFind(tenantId: string, id: string) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    if (!id) throw new BadRequestException('Request id is required');
    const found = await this.prisma.visaServiceRequest.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Visa service request not found');
    return found;
  }

  /** VSR-<year>-<seq>, unique per tenant; retries on the unique constraint. */
  private async nextTicketNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `VSR-${year}-`;
    const count = await this.prisma.visaServiceRequest.count({
      where: { tenantId, ticketNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  private async addEvent(
    requestId: string,
    actor: Actor,
    type: string,
    message: string,
    fromValue?: string | null,
    toValue?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.visaServiceRequestEvent.create({
      data: {
        requestId,
        type,
        message: message.slice(0, 400),
        fromValue: fromValue ?? undefined,
        toValue: toValue ?? undefined,
        actorId: actor?.sub,
        actorEmail: actor?.email,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private async trail(
    tenantId: string,
    actor: Actor,
    action: string,
    ticket: { id: string; ticketNumber: string },
    before?: unknown,
    after?: unknown,
  ) {
    await this.audit.log({
      tenantId,
      actorId: actor?.sub,
      actorEmail: actor?.email,
      action,
      namespace: 'visa',
      resource: 'visa_service_request',
      resourceId: ticket.id,
      beforeState: before,
      afterState: after,
      metadata: { ticketNumber: ticket.ticketNumber },
    });
  }

  /**
   * Notify the current assignee (never the actor themselves).
   * Dispatch is a side effect: a notification fault is logged loudly but must
   * never turn an already-committed ticket change into a 5xx for the caller.
   */
  private async notifyAssignee(
    tenantId: string,
    ticket: { id: string; ticketNumber: string; subject: string; assigneeId: string | null },
    actor: Actor,
    title: string,
    body: string,
  ) {
    if (!ticket.assigneeId) return;
    try {
      await this.notifications.fire({
        tenantId,
        recipientUserId: ticket.assigneeId,
        actorUserId: actor?.sub,
        type: 'VISA_REQUEST',
        title,
        body,
        link: `/visa-requests/${ticket.id}`,
        data: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, subject: ticket.subject },
      });
    } catch (err) {
      this.logger.error(
        `Notification dispatch failed for ticket ${ticket.ticketNumber}: ${(err as Error).message}`,
      );
    }
  }

  /** Resolve an assignee to a live user inside this tenant, or 400. */
  private async resolveAssignee(tenantId: string, assigneeId?: string | null) {
    if (!assigneeId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) throw new BadRequestException('Assignee must be an active user in this tenant');
    return user;
  }

  private static fullName(u: { firstName: string; lastName: string }) {
    return `${u.firstName} ${u.lastName}`.trim();
  }

  // ── queries ────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: QueryVisaRequestDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));

    const where: Prisma.VisaServiceRequestWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.assigneeId) {
      where.assigneeId = query.assigneeId === 'unassigned' ? null : query.assigneeId;
    }
    if (query.q) {
      where.OR = [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { ticketNumber: { contains: query.q, mode: 'insensitive' } },
        { requesterName: { contains: query.q, mode: 'insensitive' } },
        { requesterEmail: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (String(query.overdue) === 'true') {
      where.dueAt = { lt: new Date() };
      where.status = { in: OPEN_STATUSES };
    }

    const [items, total] = await Promise.all([
      this.prisma.visaServiceRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { notes: true, events: true } } },
      }),
      this.prisma.visaServiceRequest.count({ where }),
    ]);

    const now = Date.now();
    return {
      items: items.map((t) => ({
        ...t,
        isOverdue: !!t.dueAt && t.dueAt.getTime() < now && OPEN_STATUSES.includes(t.status),
        noteCount: t._count.notes,
        eventCount: t._count.events,
      })),
      total,
      page,
      limit,
    };
  }

  async stats(tenantId: string) {
    const statuses = Object.values(VisaRequestStatus);
    const priorities = Object.values(VisaRequestPriority);

    const [byStatusRaw, byPriorityRaw, total, overdue, unassigned] = await Promise.all([
      this.prisma.visaServiceRequest.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
      this.prisma.visaServiceRequest.groupBy({ by: ['priority'], where: { tenantId }, _count: true }),
      this.prisma.visaServiceRequest.count({ where: { tenantId } }),
      this.prisma.visaServiceRequest.count({
        where: { tenantId, dueAt: { lt: new Date() }, status: { in: OPEN_STATUSES } },
      }),
      this.prisma.visaServiceRequest.count({
        where: { tenantId, assigneeId: null, status: { in: OPEN_STATUSES } },
      }),
    ]);

    const byStatus: Record<string, number> = Object.fromEntries(statuses.map((s) => [s, 0]));
    byStatusRaw.forEach((r) => { byStatus[r.status] = r._count; });
    const byPriority: Record<string, number> = Object.fromEntries(priorities.map((p) => [p, 0]));
    byPriorityRaw.forEach((r) => { byPriority[r.priority] = r._count; });

    return {
      total,
      open: OPEN_STATUSES.reduce((sum, s) => sum + byStatus[s], 0),
      closedOrResolved: TERMINAL_STATUSES.reduce((sum, s) => sum + byStatus[s], 0),
      overdue,
      unassigned,
      byStatus,
      byPriority,
    };
  }

  /** Users in this tenant who can be put on a ticket. */
  async assignees(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }],
      take: 200,
    });
    return users.map((u) => ({ id: u.id, name: VisaRequestsService.fullName(u), email: u.email }));
  }

  async findOne(tenantId: string, id: string) {
    const ticket = await this.mustFind(tenantId, id);
    const [notes, events] = await Promise.all([
      this.prisma.visaServiceRequestNote.findMany({
        where: { requestId: id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.visaServiceRequestEvent.findMany({
        where: { requestId: id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      ...ticket,
      isOverdue: !!ticket.dueAt && ticket.dueAt.getTime() < Date.now() && OPEN_STATUSES.includes(ticket.status),
      notes,
      events,
      activity: VisaRequestsService.mergeActivity(notes, events),
    };
  }

  /**
   * The requester-facing thread: public replies only. Internal notes must
   * never leak here — this is what a customer view / email digest reads.
   */
  async publicThread(tenantId: string, id: string) {
    const ticket = await this.mustFind(tenantId, id);
    const notes = await this.prisma.visaServiceRequestNote.findMany({
      where: { requestId: id, visibility: VisaRequestNoteVisibility.PUBLIC },
      orderBy: { createdAt: 'asc' },
    });
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      messages: notes.map((n) => ({
        id: n.id,
        body: n.body,
        authorName: n.authorName,
        createdAt: n.createdAt,
      })),
    };
  }

  private static mergeActivity(
    notes: { id: string; createdAt: Date; body: string; visibility: string; authorName: string | null }[],
    events: { id: string; createdAt: Date; type: string; message: string; actorEmail: string | null }[],
  ) {
    const merged = [
      ...events.map((e) => ({
        kind: 'EVENT' as const,
        id: e.id,
        at: e.createdAt,
        type: e.type,
        text: e.message,
        author: e.actorEmail,
      })),
      ...notes.map((n) => ({
        kind: 'NOTE' as const,
        id: n.id,
        at: n.createdAt,
        type: n.visibility,
        text: n.body,
        author: n.authorName,
      })),
    ];
    return merged.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  // ── mutations ──────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateVisaRequestDto, actor: Actor) {
    if (!tenantId) throw new BadRequestException('Missing tenant context');
    const assignee = await this.resolveAssignee(tenantId, dto.assigneeId);

    let ticket: Awaited<ReturnType<typeof this.prisma.visaServiceRequest.create>> | null = null;
    for (let attempt = 0; attempt < 5 && !ticket; attempt++) {
      const ticketNumber = await this.nextTicketNumber(tenantId);
      try {
        ticket = await this.prisma.visaServiceRequest.create({
          data: {
            tenantId,
            ticketNumber,
            subject: dto.subject,
            description: dto.description,
            category: dto.category ?? VisaRequestCategory.OTHER,
            priority: dto.priority ?? VisaRequestPriority.NORMAL,
            status: VisaRequestStatus.OPEN,
            requesterName: dto.requesterName,
            requesterEmail: dto.requesterEmail,
            requesterPhone: dto.requesterPhone,
            requesterId: actor?.sub,
            pilgrimId: dto.pilgrimId,
            visaApplicationId: dto.visaApplicationId,
            assigneeId: assignee?.id,
            assigneeName: assignee ? VisaRequestsService.fullName(assignee) : undefined,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
            createdBy: actor?.sub,
          },
        });
      } catch (err) {
        // Another request took this number — recount and retry.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    if (!ticket) throw new BadRequestException('Could not allocate a ticket number, please retry');

    await this.addEvent(ticket.id, actor, 'CREATED', `Ticket ${ticket.ticketNumber} created`, null, ticket.status);
    if (assignee) {
      await this.addEvent(ticket.id, actor, 'ASSIGNED', `Assigned to ${VisaRequestsService.fullName(assignee)}`, null, assignee.id);
      await this.notifyAssignee(tenantId, ticket, actor, `New visa request ${ticket.ticketNumber}`, ticket.subject);
    }
    await this.trail(tenantId, actor, 'CREATE', ticket, undefined, ticket);
    return ticket;
  }

  async update(tenantId: string, id: string, dto: UpdateVisaRequestDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);

    const data: Prisma.VisaServiceRequestUpdateInput = {};
    if (dto.subject !== undefined) data.subject = dto.subject;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.requesterName !== undefined) data.requesterName = dto.requesterName;
    if (dto.requesterEmail !== undefined) data.requesterEmail = dto.requesterEmail;
    if (dto.requesterPhone !== undefined) data.requesterPhone = dto.requesterPhone;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;

    if (!Object.keys(data).length) throw new BadRequestException('No editable fields supplied');

    const ticket = await this.prisma.visaServiceRequest.update({ where: { id }, data });

    if (dto.priority !== undefined && dto.priority !== before.priority) {
      await this.addEvent(id, actor, 'PRIORITY_CHANGED', `Priority ${before.priority} → ${dto.priority}`, before.priority, dto.priority);
    }
    if (dto.category !== undefined && dto.category !== before.category) {
      await this.addEvent(id, actor, 'CATEGORY_CHANGED', `Category ${before.category} → ${dto.category}`, before.category, dto.category);
    }
    if (dto.dueAt !== undefined) {
      const to = ticket.dueAt ? ticket.dueAt.toISOString() : 'none';
      await this.addEvent(id, actor, 'DUE_DATE_CHANGED', `Due date set to ${to}`, before.dueAt?.toISOString() ?? null, to);
    }
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async assign(tenantId: string, id: string, assigneeId: string | null | undefined, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    const assignee = await this.resolveAssignee(tenantId, assigneeId);

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: {
        assigneeId: assignee?.id ?? null,
        assigneeName: assignee ? VisaRequestsService.fullName(assignee) : null,
      },
    });

    const label = assignee ? VisaRequestsService.fullName(assignee) : 'Unassigned';
    await this.addEvent(id, actor, 'ASSIGNED', `Assignee: ${before.assigneeName ?? 'Unassigned'} → ${label}`, before.assigneeId, ticket.assigneeId);
    if (assignee && assignee.id !== before.assigneeId) {
      await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} assigned to you`, ticket.subject);
    }
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async changeStatus(tenantId: string, id: string, dto: ChangeStatusDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    if (before.status === VisaRequestStatus.CLOSED) {
      throw new BadRequestException('Ticket is closed — reopen it before changing status');
    }
    if (before.status === dto.status) {
      throw new BadRequestException(`Ticket is already ${dto.status}`);
    }

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: {
        status: dto.status,
        // Moving back into an active state clears the terminal stamps.
        resolvedAt: null,
        closedAt: null,
        escalatedAt: before.status === VisaRequestStatus.ESCALATED ? null : before.escalatedAt,
      },
    });

    await this.addEvent(id, actor, 'STATUS_CHANGED', `Status ${before.status} → ${dto.status}`, before.status, dto.status);
    await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} is now ${dto.status}`, ticket.subject);
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async addNote(tenantId: string, id: string, dto: AddNoteDto, actor: Actor) {
    const ticket = await this.mustFind(tenantId, id);
    const body = (dto.body ?? '').trim();
    if (!body) throw new BadRequestException('Note body cannot be empty');

    const visibility = dto.visibility ?? VisaRequestNoteVisibility.INTERNAL;
    const note = await this.prisma.visaServiceRequestNote.create({
      data: {
        requestId: id,
        body,
        visibility,
        authorId: actor?.sub,
        authorName: actor?.email,
      },
    });

    // First public reply stamps the response clock.
    if (visibility === VisaRequestNoteVisibility.PUBLIC && !ticket.firstResponseAt) {
      await this.prisma.visaServiceRequest.update({
        where: { id },
        data: { firstResponseAt: new Date() },
      });
    }

    await this.addEvent(
      id, actor,
      visibility === VisaRequestNoteVisibility.PUBLIC ? 'PUBLIC_REPLY' : 'INTERNAL_NOTE',
      visibility === VisaRequestNoteVisibility.PUBLIC ? 'Public response sent to requester' : 'Internal note added',
      null, visibility,
    );
    await this.notifyAssignee(
      tenantId, ticket, actor,
      `New ${visibility === 'PUBLIC' ? 'response' : 'note'} on ${ticket.ticketNumber}`,
      body.slice(0, 140),
    );
    await this.trail(tenantId, actor, 'UPDATE', ticket, undefined, { noteId: note.id, visibility });
    return note;
  }

  async escalate(tenantId: string, id: string, dto: EscalateDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    if (before.status === VisaRequestStatus.ESCALATED) {
      throw new BadRequestException('Ticket is already escalated');
    }
    if (TERMINAL_STATUSES.includes(before.status)) {
      throw new BadRequestException(`Cannot escalate a ${before.status} ticket — reopen it first`);
    }

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: {
        status: VisaRequestStatus.ESCALATED,
        escalatedAt: new Date(),
        escalationReason: dto.reason,
        // Escalation always raises urgency at least to HIGH.
        priority: before.priority === VisaRequestPriority.URGENT
          ? VisaRequestPriority.URGENT
          : VisaRequestPriority.HIGH,
      },
    });

    await this.addEvent(id, actor, 'ESCALATED', `Escalated: ${dto.reason}`, before.status, ticket.status);
    await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} escalated`, dto.reason);
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async resolve(tenantId: string, id: string, dto: ResolveDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    if (before.status === VisaRequestStatus.RESOLVED) throw new BadRequestException('Ticket is already resolved');
    if (before.status === VisaRequestStatus.CLOSED) throw new BadRequestException('Ticket is closed — reopen it before resolving');

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: { status: VisaRequestStatus.RESOLVED, resolvedAt: new Date(), resolution: dto.resolution },
    });

    await this.addEvent(id, actor, 'RESOLVED', `Resolved: ${dto.resolution}`, before.status, ticket.status);
    await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} resolved`, dto.resolution);
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async close(tenantId: string, id: string, dto: CloseDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    if (before.status === VisaRequestStatus.CLOSED) throw new BadRequestException('Ticket is already closed');

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: { status: VisaRequestStatus.CLOSED, closedAt: new Date() },
    });

    await this.addEvent(id, actor, 'CLOSED', dto.note ? `Closed: ${dto.note}` : 'Ticket closed', before.status, ticket.status);
    await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} closed`, dto.note ?? ticket.subject);
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async reopen(tenantId: string, id: string, dto: ReopenDto, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    if (!TERMINAL_STATUSES.includes(before.status)) {
      throw new BadRequestException(`Only resolved or closed tickets can be reopened (this one is ${before.status})`);
    }

    const ticket = await this.prisma.visaServiceRequest.update({
      where: { id },
      data: {
        status: VisaRequestStatus.OPEN,
        reopenedAt: new Date(),
        reopenCount: { increment: 1 },
        closedAt: null,
        resolvedAt: null,
      },
    });

    await this.addEvent(id, actor, 'REOPENED', `Reopened: ${dto.reason}`, before.status, ticket.status);
    await this.notifyAssignee(tenantId, ticket, actor, `Visa request ${ticket.ticketNumber} reopened`, dto.reason);
    await this.trail(tenantId, actor, 'UPDATE', ticket, before, ticket);
    return ticket;
  }

  async remove(tenantId: string, id: string, actor: Actor) {
    const before = await this.mustFind(tenantId, id);
    await this.prisma.visaServiceRequest.delete({ where: { id } });
    await this.trail(tenantId, actor, 'DELETE', before, before, undefined);
    return { deleted: true, id };
  }
}
