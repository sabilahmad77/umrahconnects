import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Server-side trigger called by other services to fire a notification.
   * No HTTP exposure — invoked via NotificationsService.fire(...) from
   * SocialService, MarketplaceRequestsService, ConnectionsService, etc.
   */
  async fire(input: {
    tenantId?: string;
    recipientUserId: string;
    actorUserId?: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
    data?: Record<string, unknown>;
  }) {
    // Don't notify yourself
    if (input.actorUserId === input.recipientUserId) return null;
    return this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        recipientId: input.recipientUserId,
        actorId: input.actorUserId,
        type: input.type as any,
        title: input.title,
        body: input.body,
        link: input.link,
        data: (input.data ?? {}) as any,
      },
    });
  }

  async findMine(userId: string, params: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 20)));
    const where: any = { recipientId: userId };
    if (params.unreadOnly) where.readAt = null;
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientId: userId, readAt: null } }),
    ]);
    return { items, total, unread, page, limit };
  }

  async markRead(userId: string, ids: string[]) {
    if (!ids.length) return { updated: 0 };
    const res = await this.prisma.notification.updateMany({
      where: { id: { in: ids }, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}
