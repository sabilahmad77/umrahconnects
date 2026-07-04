import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ConnectionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Send a connection request from `requester` to `recipientUserId`. */
  async request(requesterUserId: string, recipientUserId: string, message?: string) {
    if (requesterUserId === recipientUserId) {
      throw new BadRequestException('Cannot connect with yourself');
    }
    // Look for either-direction existing record
    const existing = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: requesterUserId, recipientId: recipientUserId },
          { requesterId: recipientUserId, recipientId: requesterUserId },
        ],
      },
    });
    if (existing) {
      if (existing.status === 'ACCEPTED') return existing;
      if (existing.status === 'PENDING') return existing;
      // RE-OPEN a previously rejected/blocked one only if user re-requests
      return this.prisma.connection.update({
        where: { id: existing.id },
        data: {
          requesterId: requesterUserId,
          recipientId: recipientUserId,
          status: 'PENDING',
          message,
          respondedAt: null,
        },
      });
    }

    const conn = await this.prisma.connection.create({
      data: {
        requesterId: requesterUserId,
        recipientId: recipientUserId,
        status: 'PENDING',
        message,
      },
    });

    // Notify recipient
    await this.notifications.fire({
      recipientUserId,
      actorUserId: requesterUserId,
      type: 'CONNECTION_REQUEST',
      title: 'New connection request',
      body: message ?? 'You have a new connection request.',
      link: '/connections',
      data: { connectionId: conn.id, requesterId: requesterUserId },
    });
    return conn;
  }

  async respond(currentUserId: string, connectionId: string, decision: 'ACCEPTED' | 'REJECTED') {
    const conn = await this.prisma.connection.findUnique({ where: { id: connectionId } });
    if (!conn) throw new NotFoundException('Connection request not found');
    if (conn.recipientId !== currentUserId) {
      throw new BadRequestException('Only the recipient can respond to this request');
    }
    if (conn.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${conn.status.toLowerCase()}`);
    }
    const updated = await this.prisma.connection.update({
      where: { id: connectionId },
      data: { status: decision, respondedAt: new Date() },
    });
    if (decision === 'ACCEPTED') {
      await this.notifications.fire({
        recipientUserId: conn.requesterId,
        actorUserId: currentUserId,
        type: 'CONNECTION_ACCEPTED',
        title: 'Connection accepted',
        body: 'Your connection request was accepted.',
        link: '/connections',
        data: { connectionId: conn.id },
      });
    }
    return updated;
  }

  async remove(currentUserId: string, otherUserId: string) {
    const conn = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, recipientId: otherUserId },
          { requesterId: otherUserId, recipientId: currentUserId },
        ],
      },
    });
    if (!conn) return { removed: false };
    await this.prisma.connection.delete({ where: { id: conn.id } });
    return { removed: true };
  }

  /** Connections the user is in (accepted, either side). Returns the *other* party's user id. */
  async listAccepted(userId: string) {
    const rows = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: userId }, { recipientId: userId }],
      },
      orderBy: { respondedAt: 'desc' },
    });
    const otherUserIds = rows.map((r) => (r.requesterId === userId ? r.recipientId : r.requesterId));
    // Hydrate with user + social-account info
    const users = otherUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: otherUserIds } },
          select: {
            id: true,
            email: true,
            socialAccount: { select: { displayName: true, avatarUrl: true, bio: true, isVerified: true } },
          },
        })
      : [];
    return {
      items: rows.map((c) => {
        const otherId = c.requesterId === userId ? c.recipientId : c.requesterId;
        const other = users.find((u) => u.id === otherId);
        return {
          connectionId: c.id,
          since: c.respondedAt,
          otherUserId: otherId,
          email: other?.email,
          displayName: other?.socialAccount?.displayName,
          avatarUrl: other?.socialAccount?.avatarUrl,
          bio: other?.socialAccount?.bio,
          verified: other?.socialAccount?.isVerified,
        };
      }),
      total: rows.length,
    };
  }

  /** Pending requests where current user is the recipient. */
  async listPending(userId: string) {
    const rows = await this.prisma.connection.findMany({
      where: { recipientId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const requesterIds = rows.map((r) => r.requesterId);
    const users = requesterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: requesterIds } },
          select: {
            id: true,
            email: true,
            socialAccount: { select: { displayName: true, avatarUrl: true, bio: true } },
          },
        })
      : [];
    return {
      items: rows.map((c) => {
        const u = users.find((x) => x.id === c.requesterId);
        return {
          connectionId: c.id,
          createdAt: c.createdAt,
          message: c.message,
          requesterId: c.requesterId,
          email: u?.email,
          displayName: u?.socialAccount?.displayName,
          avatarUrl: u?.socialAccount?.avatarUrl,
          bio: u?.socialAccount?.bio,
        };
      }),
      total: rows.length,
    };
  }

  /** Returns status of the connection between current user and target. */
  async status(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) return { status: 'SELF' };
    const c = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, recipientId: otherUserId },
          { requesterId: otherUserId, recipientId: currentUserId },
        ],
      },
    });
    if (!c) return { status: 'NONE' };
    const direction = c.requesterId === currentUserId ? 'OUTGOING' : 'INCOMING';
    return { status: c.status, direction, connectionId: c.id };
  }
}
