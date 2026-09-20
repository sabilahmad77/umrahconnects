import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { requireId } from '../../common/tenant-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** The other party of a connection as a client may see them. */
interface PartyProfile {
  id: string;
  email: string | null;
  socialAccount: {
    displayName: string;
    avatarUrl: string | null;
    bio: string | null;
    isVerified: boolean;
    contactVisibility: string;
  } | null;
}

/**
 * Connections are bidirectional and need the recipient's acceptance. Every
 * handler is scoped to the caller (requester or recipient); other ids get the
 * same 404 as unknown ones.
 *
 * A party's email is contact data: it is shown only when their contact
 * visibility allows it (PUBLIC — always; CONNECTIONS — once connected; PRIVATE —
 * never). Strangers sending a request do not learn each other's address.
 */
@Injectable()
export class ConnectionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async profiles(userIds: string[]): Promise<PartyProfile[]> {
    if (!userIds.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        socialAccount: { select: { displayName: true, avatarUrl: true, bio: true, isVerified: true, contactVisibility: true } },
      },
    });
  }

  private present(profile: PartyProfile | undefined, connected: boolean) {
    const visibility = (profile?.socialAccount?.contactVisibility ?? 'CONNECTIONS').toUpperCase();
    const emailVisible = visibility === 'PUBLIC' || (visibility === 'CONNECTIONS' && connected);
    const fallbackName = profile?.email ? profile.email.split('@')[0] : undefined;
    return {
      email: emailVisible ? profile?.email ?? undefined : undefined,
      displayName: profile?.socialAccount?.displayName ?? fallbackName,
      avatarUrl: profile?.socialAccount?.avatarUrl ?? undefined,
      bio: profile?.socialAccount?.bio ?? undefined,
      verified: profile?.socialAccount?.isVerified ?? false,
    };
  }

  /** Send a connection request from `requester` to `recipientUserId`. */
  async request(requesterUserId: string, recipientUserId: string, message?: string) {
    recipientUserId = requireId(recipientUserId, 'Recipient');
    if (requesterUserId === recipientUserId) {
      throw new BadRequestException('Cannot connect with yourself');
    }
    // The recipient must be an existing, usable account.
    const recipient = await this.prisma.user.findFirst({
      where: { id: recipientUserId, deletedAt: null, status: { notIn: ['INACTIVE', 'LOCKED'] } },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('User not found');
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
      // A block is never lifted by a new request (from either party); the caller
      // learns only that no request can be sent.
      if (existing.status === 'BLOCKED') {
        throw new ConflictException('A connection request cannot be sent to this user');
      }
      // RE-OPEN a previously rejected one only if user re-requests
      const reopened = await this.prisma.connection.update({
        where: { id: existing.id },
        data: {
          requesterId: requesterUserId,
          recipientId: recipientUserId,
          status: 'PENDING',
          message,
          respondedAt: null,
        },
      });
      await this.notifyRequest(reopened.id, requesterUserId, recipientUserId, message);
      return reopened;
    }

    const conn = await this.prisma.connection.create({
      data: {
        requesterId: requesterUserId,
        recipientId: recipientUserId,
        status: 'PENDING',
        message,
      },
    });
    await this.notifyRequest(conn.id, requesterUserId, recipientUserId, message);
    return conn;
  }

  private async notifyRequest(connectionId: string, requesterUserId: string, recipientUserId: string, message?: string) {
    const [requester] = await this.profiles([requesterUserId]);
    const name = this.present(requester, false).displayName ?? 'Someone';
    await this.notifications.fire({
      recipientUserId,
      actorUserId: requesterUserId,
      type: 'CONNECTION_REQUEST',
      title: `${name} wants to connect`,
      body: message ?? 'You have a new connection request.',
      link: '/connections',
      data: { connectionId, requesterId: requesterUserId },
    });
  }

  async respond(currentUserId: string, connectionId: string, decision: 'ACCEPTED' | 'REJECTED') {
    const conn = await this.prisma.connection.findUnique({ where: { id: requireId(connectionId, 'Connection') } });
    // Outsiders get the same answer as for an unknown id.
    if (!conn || (conn.recipientId !== currentUserId && conn.requesterId !== currentUserId)) {
      throw new NotFoundException('Connection request not found');
    }
    if (conn.recipientId !== currentUserId) {
      throw new BadRequestException('Only the recipient can respond to this request');
    }
    if (conn.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${conn.status.toLowerCase()}`);
    }
    const updated = await this.prisma.connection.update({
      where: { id: conn.id },
      data: { status: decision, respondedAt: new Date() },
    });
    if (decision === 'ACCEPTED') {
      const [me] = await this.profiles([currentUserId]);
      const name = this.present(me, true).displayName ?? 'Your contact';
      await this.notifications.fire({
        recipientUserId: conn.requesterId,
        actorUserId: currentUserId,
        type: 'CONNECTION_ACCEPTED',
        title: `${name} accepted your connection request`,
        body: 'You are now connected.',
        link: '/connections',
        data: { connectionId: conn.id },
      });
    }
    return updated;
  }

  /** Removes a connection or withdraws/dismisses a pending request, in either direction. */
  async remove(currentUserId: string, otherUserId: string) {
    const conn = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, recipientId: otherUserId },
          { requesterId: otherUserId, recipientId: currentUserId },
        ],
      },
    });
    // A block is permanent: neither party can erase it (and then send a fresh request).
    if (!conn || conn.status === 'BLOCKED') return { removed: false };
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
    const otherIds = rows.map((r) => (r.requesterId === userId ? r.recipientId : r.requesterId));
    const users = await this.profiles(otherIds);
    return {
      items: rows.map((c) => {
        const otherId = c.requesterId === userId ? c.recipientId : c.requesterId;
        return { connectionId: c.id, since: c.respondedAt, otherUserId: otherId, ...this.present(users.find((u) => u.id === otherId), true) };
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
    const users = await this.profiles(rows.map((r) => r.requesterId));
    return {
      items: rows.map((c) => ({
        connectionId: c.id,
        createdAt: c.createdAt,
        message: c.message,
        requesterId: c.requesterId,
        ...this.present(users.find((x) => x.id === c.requesterId), false),
      })),
      total: rows.length,
    };
  }

  /** Pending requests the current user sent (so they can see and withdraw them). */
  async listOutgoing(userId: string) {
    const rows = await this.prisma.connection.findMany({
      where: { requesterId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const users = await this.profiles(rows.map((r) => r.recipientId));
    return {
      items: rows.map((c) => ({
        connectionId: c.id,
        createdAt: c.createdAt,
        message: c.message,
        recipientId: c.recipientId,
        ...this.present(users.find((x) => x.id === c.recipientId), false),
      })),
      total: rows.length,
    };
  }

  /**
   * Returns status of the connection between current user and target. A block is reported to both
   * parties as UNAVAILABLE — no direction, no id — so neither side learns who blocked whom (same
   * answer as the people directory in SocialService).
   */
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
    if (c.status === 'BLOCKED') return { status: 'UNAVAILABLE' };
    const direction = c.requesterId === currentUserId ? 'OUTGOING' : 'INCOMING';
    return { status: c.status, direction, connectionId: c.id };
  }
}
