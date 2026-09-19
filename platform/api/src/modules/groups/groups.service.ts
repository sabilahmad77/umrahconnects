import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Principal } from '../auth/principal';
import { findOwned, assertOwnedIfPresent, requireId } from '../../common/tenant-scope';
import { PUBLIC_GROUP_SELECT } from './group-public.select';

/**
 * Access model
 *  - "manage": the group belongs to the caller's organization AND the caller holds
 *    the CRM capability for the action (crm:pilgrim:read to read, crm:pilgrim:update
 *    to write). Required for every write to the group itself and for every
 *    sensitive read (member contact data, notes, documents, incidents, invites,
 *    related bookings).
 *  - "content": the caller manages the group OR is an ACTIVE member of it. Grants
 *    reading and writing the discussion (posts, comments) and voting in polls.
 *    Travelers are members, never managers: they share one community organization
 *    (D-007), so organization membership alone never grants anything here.
 *  - Members, invitees and anyone holding the link of a PUBLIC or UNLISTED group
 *    see only PUBLIC_GROUP_SELECT plus their own membership / invitation.
 * Foreign and unknown ids always yield the same 404.
 */
export interface GroupAccess {
  userId: string;
  tenantId: string;
  email?: string | null;
  /** crm:pilgrim:read, which only ever applies inside the caller's organization */
  canRead: boolean;
  /** crm:pilgrim:update, which only ever applies inside the caller's organization */
  canUpdate: boolean;
}

export const GROUP_VISIBILITIES = ['PRIVATE', 'UNLISTED', 'PUBLIC'] as const;
/** Visibilities a non-member may open by link and join directly. */
const JOINABLE = ['PUBLIC', 'UNLISTED'];

const personName = (u?: { firstName: string | null; lastName: string | null } | null) =>
  u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Member' : 'Member';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Listing & basic CRUD ──────────────────────────────────────────────
  async findAll(tenantId: string, query: any) {
    const { status, search, visibility, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: Prisma.TripGroupWhereInput = { tenantId };
    if (status) where.status = String(status).toUpperCase();
    if (visibility) where.visibility = String(visibility).toUpperCase();
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.tripGroup.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { incidents: true, members: true, posts: true, notes: true, polls: true } },
        },
      }),
      this.prisma.tripGroup.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /** Membership-scoped list: only safe group fields plus the caller's own membership role. */
  async findMine(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      take: 100,
      select: { role: true, joinedAt: true, group: { select: PUBLIC_GROUP_SELECT } },
    });
    return memberships.map((m) => ({ ...m.group, membership: { role: m.role, joinedAt: m.joinedAt } }));
  }

  // Public/discoverable groups across tenants (PUBLIC visibility)
  async findPublic(query: any) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: Prisma.TripGroupWhereInput = { visibility: 'PUBLIC' };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      this.prisma.tripGroup.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        select: PUBLIC_GROUP_SELECT,
      }),
      this.prisma.tripGroup.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  private async membershipOf(groupId: string, userId: string) {
    if (!userId) return null;
    const m = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true, joinedAt: true },
    });
    return m && m.status === 'ACTIVE' ? { role: m.role, joinedAt: m.joinedAt } : null;
  }

  /** Where-clause for invitations addressed to the caller (by account, or by email for email-only invites). */
  private addressedTo(access: Pick<GroupAccess, 'userId' | 'email'>): Prisma.GroupInviteWhereInput {
    const email = (access.email ?? '').trim().toLowerCase();
    return {
      OR: [
        { inviteeUserId: access.userId },
        ...(email ? [{ inviteeUserId: null, inviteeEmail: { equals: email, mode: 'insensitive' as const } }] : []),
      ],
    };
  }

  /**
   * Detail read. The managing organization gets the full record; members,
   * invitees and link holders of PUBLIC/UNLISTED groups get the public-safe
   * projection. Every answer carries `viewer` — what the caller may do here.
   */
  async findOne(access: GroupAccess, id: string) {
    const safeId = requireId(id, 'Group');
    const membership = await this.membershipOf(safeId, access.userId);
    if (access.canRead && access.tenantId) {
      const group = await this.prisma.tripGroup.findFirst({
        where: { id: safeId, tenantId: access.tenantId },
        include: {
          incidents: { orderBy: { createdAt: 'desc' }, take: 20 },
          _count: { select: { members: true, posts: true, notes: true, polls: true, incidents: true } },
        },
      });
      if (group) return { ...group, viewer: { canManage: access.canUpdate, canRead: true, membership, pendingInvite: null } };
    }
    const group = await this.prisma.tripGroup.findFirst({ where: { id: safeId }, select: PUBLIC_GROUP_SELECT });
    if (!group) throw new NotFoundException('Group not found');
    const invite = await this.prisma.groupInvite.findFirst({
      where: { AND: [{ groupId: safeId, status: 'PENDING' }, this.addressedTo(access)] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, message: true, createdAt: true },
    });
    if (!membership && !invite && !JOINABLE.includes(group.visibility)) throw new NotFoundException('Group not found');
    return {
      ...group,
      viewer: {
        canManage: false,
        canRead: !!membership,
        membership,
        pendingInvite: invite,
        canJoin: !membership && JOINABLE.includes(group.visibility),
      },
    };
  }

  /** Management guard: the group must belong to the caller's tenant. */
  private async manageGroup(tenantId: string, groupId: string) {
    return findOwned<{ id: string; tenantId: string; name: string }>(
      this.prisma.tripGroup, groupId, tenantId, 'Group', {}, { id: true, tenantId: true, name: true },
    );
  }

  /**
   * Content guard: the caller manages the group (organization + capability) or is
   * an ACTIVE member. Anyone else gets the 404 of an unknown id.
   */
  private async contentGroup(access: GroupAccess, groupId: string, need: 'read' | 'write') {
    const safeId = requireId(groupId, 'Group');
    const group = await this.prisma.tripGroup.findUnique({ where: { id: safeId }, select: { id: true, tenantId: true, name: true } });
    if (!group) throw new NotFoundException('Group not found');
    const inOrg = !!access.tenantId && group.tenantId === access.tenantId;
    const managesRead = inOrg && access.canRead;
    const manages = inOrg && access.canUpdate;
    const member = !!(await this.membershipOf(group.id, access.userId));
    if (!managesRead && !member) throw new NotFoundException('Group not found');
    if (need === 'write' && !manages && !member) {
      throw new ForbiddenException('Your role can read this group but not post in it');
    }
    return { ...group, manages, member };
  }

  private async callerGroupRole(groupId: string, userId: string) {
    return (await this.membershipOf(groupId, userId))?.role ?? null;
  }

  /** A user id supplied by a client must be an active user of the caller's tenant. */
  private async assertTenantUser(tenantId: string, userId: string, label = 'User') {
    await findOwned(this.prisma.user, userId, tenantId, label, { deletedAt: null, status: { notIn: ['INACTIVE', 'LOCKED'] } }, { id: true });
  }

  async create(tenantId: string, createdBy: string, dto: any) {
    if (dto.leadGuideId) await this.assertTenantUser(tenantId, dto.leadGuideId, 'Lead guide');
    const group = await this.prisma.tripGroup.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        coverUrl: dto.coverUrl,
        visibility: (dto.visibility ?? 'PRIVATE').toUpperCase(),
        tripType: dto.tripType ?? 'UMRAH',
        season: dto.season,
        departureDate: dto.departureDate ? new Date(dto.departureDate) : undefined,
        returnDate: dto.returnDate ? new Date(dto.returnDate) : undefined,
        capacity: dto.maxCapacity ?? dto.capacity ?? 40,
        leadGuideId: dto.leadGuideId,
        status: (dto.status ?? 'PLANNING').toUpperCase(),
        itinerary: [],
        briefingNotes: dto.notes,
        createdBy: createdBy && createdBy.length === 36 ? createdBy : null,
      },
    });
    // Owner is automatically a member
    if (createdBy && createdBy.length === 36) {
      await this.prisma.groupMember.create({
        data: { groupId: group.id, userId: createdBy, role: 'OWNER', status: 'ACTIVE' },
      });
    }
    return group;
  }

  async update(tenantId: string, id: string, dto: any) {
    await this.manageGroup(tenantId, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
    if (dto.visibility !== undefined) data.visibility = String(dto.visibility).toUpperCase();
    if (dto.status !== undefined) data.status = String(dto.status).toUpperCase();
    if (dto.tripType !== undefined) data.tripType = dto.tripType;
    if (dto.season !== undefined) data.season = dto.season;
    if (dto.capacity !== undefined || dto.maxCapacity !== undefined) data.capacity = dto.maxCapacity ?? dto.capacity;
    if (dto.departureDate) data.departureDate = new Date(dto.departureDate);
    if (dto.returnDate) data.returnDate = new Date(dto.returnDate);
    if (dto.notes !== undefined) data.briefingNotes = dto.notes;
    if (dto.briefingNotes !== undefined) data.briefingNotes = dto.briefingNotes;
    if (dto.itinerary !== undefined) data.itinerary = dto.itinerary;
    if (dto.emergencyContact !== undefined) data.emergencyContact = dto.emergencyContact;
    return this.prisma.tripGroup.update({ where: { id }, data });
  }

  /**
   * Deletes a group and everything that exists only inside it. Incident reports,
   * linked bookings and transport assignments are operational records kept
   * elsewhere, so a group that has any is refused — close it (COMPLETED /
   * CANCELLED) instead. (Deleting used to fail with a foreign-key error once an
   * incident existed, and silently orphaned documents and linked bookings.)
   */
  async remove(tenantId: string, id: string) {
    await this.manageGroup(tenantId, id);
    const [incidents, bookings, transport] = await Promise.all([
      this.prisma.incident.count({ where: { groupId: id } }),
      this.prisma.booking.count({ where: { groupId: id } }),
      this.prisma.transportAssignment.count({ where: { groupId: id } }),
    ]);
    if (incidents || bookings || transport) {
      const kept = [
        incidents && `${incidents} incident report${incidents === 1 ? '' : 's'}`,
        bookings && `${bookings} linked booking${bookings === 1 ? '' : 's'}`,
        transport && `${transport} transport assignment${transport === 1 ? '' : 's'}`,
      ].filter(Boolean).join(', ');
      throw new ConflictException(`This group has ${kept}. Close it (status Completed or Cancelled) instead of deleting it.`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { groupId: id } });
      await tx.groupInvite.deleteMany({ where: { groupId: id } });
      await tx.groupNote.deleteMany({ where: { groupId: id } });
      await tx.groupDocument.deleteMany({ where: { groupId: id } });
      await tx.groupPostComment.deleteMany({ where: { post: { groupId: id } } });
      await tx.groupPost.deleteMany({ where: { groupId: id } });
      await tx.groupPollVote.deleteMany({ where: { poll: { groupId: id } } });
      await tx.groupPoll.deleteMany({ where: { groupId: id } });
      return tx.tripGroup.delete({ where: { id } });
    });
  }

  // ─── Members ─────────────────────────────────────────────────────────
  async listMembers(tenantId: string, groupId: string) {
    await this.manageGroup(tenantId, groupId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
    });
    // Hydrate user info (email/role) — best effort, ignore missing
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, firstName: true, lastName: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return members.map((m) => {
      const u = byId.get(m.userId);
      return { ...m, user: u ? { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName } : null };
    });
  }

  async addMember(tenantId: string, callerId: string, groupId: string, userId: string, role?: string) {
    await this.manageGroup(tenantId, groupId);
    await this.assertTenantUser(tenantId, userId);
    const callerIsOwner = (await this.callerGroupRole(groupId, callerId)) === 'OWNER';
    if (role === 'OWNER' && !callerIsOwner) {
      throw new ForbiddenException('Only a group owner can grant the OWNER role');
    }
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) {
      // An owner can only be demoted by another owner.
      const nextRole = existing.role === 'OWNER' && !callerIsOwner ? existing.role : (role || existing.role);
      return this.prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { status: 'ACTIVE', role: nextRole },
      });
    }
    const m = await this.prisma.groupMember.create({
      data: { groupId, userId, role: role || 'MEMBER', status: 'ACTIVE' },
    });
    await this.prisma.tripGroup.update({
      where: { id: groupId },
      data: { enrolledCount: { increment: 1 } },
    });
    return m;
  }

  async removeMember(tenantId: string, groupId: string, userId: string) {
    await this.manageGroup(tenantId, groupId);
    await this.deleteMembership(groupId, userId);
    return { success: true };
  }

  /**
   * Removes a membership and keeps the enrolment counter in step: it moves only
   * when a counted (non-owner) membership really existed, and never below zero.
   */
  private async deleteMembership(groupId: string, userId: string): Promise<boolean> {
    const existing = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true },
    });
    if (!existing) return false;
    const removed = await this.prisma.groupMember.deleteMany({ where: { groupId, userId } });
    if (removed.count && existing.role !== 'OWNER') {
      await this.prisma.tripGroup.updateMany({
        where: { id: groupId, enrolledCount: { gt: 0 } },
        data: { enrolledCount: { decrement: 1 } },
      });
    }
    return removed.count > 0;
  }

  // ─── Self-service join/leave — PUBLIC groups, or UNLISTED ones by link ──
  async selfJoin(groupId: string, userId: string) {
    const group = await this.prisma.tripGroup.findUnique({ where: { id: requireId(groupId, 'Group') } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing?.status === 'ACTIVE') return existing;
    if (!JOINABLE.includes(group.visibility)) {
      throw new ForbiddenException('Only public groups can be joined directly — ask for an invite.');
    }
    if (group.capacity > 0 && group.enrolledCount >= group.capacity) {
      throw new ConflictException('This group is full. Contact the organizer.');
    }
    if (existing) {
      const m = await this.prisma.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { status: 'ACTIVE' } });
      await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { increment: 1 } } });
      return m;
    }
    // A double click may race this request: only the insert that happened moves the counter.
    const created = await this.prisma.groupMember.createMany({
      data: [{ groupId, userId, role: 'MEMBER', status: 'ACTIVE' }],
      skipDuplicates: true,
    });
    if (created.count) await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { increment: 1 } } });
    return this.prisma.groupMember.findUniqueOrThrow({ where: { groupId_userId: { groupId, userId } } });
  }

  async selfLeave(groupId: string, userId: string) {
    // Leaving a group the caller is not in changes nothing (and reveals nothing).
    await this.deleteMembership(groupId, userId);
    return { left: true };
  }

  // ─── Invites ─────────────────────────────────────────────────────────
  async listInvites(tenantId: string, groupId: string) {
    await this.manageGroup(tenantId, groupId);
    return this.prisma.groupInvite.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Invitations are delivered in the app: an invite by user id notifies that
   * user; an invite by email notifies every active account with that address
   * (and waits for anyone who signs up with it later). No email is sent.
   */
  async createInvite(tenantId: string, groupId: string, invitedBy: string, dto: { inviteeUserId?: string; inviteeEmail?: string; message?: string }) {
    const group = await this.manageGroup(tenantId, groupId);
    if (!dto.inviteeUserId && !dto.inviteeEmail) {
      throw new BadRequestException('inviteeUserId or inviteeEmail required');
    }
    // Users outside the caller's organization can only be invited by email.
    if (dto.inviteeUserId) await this.assertTenantUser(tenantId, dto.inviteeUserId, 'Invitee');
    const inviteeEmail = dto.inviteeEmail ? dto.inviteeEmail.trim().toLowerCase() : undefined;

    const recipients = dto.inviteeUserId
      ? [dto.inviteeUserId]
      : (
          await this.prisma.user.findMany({
            where: { email: { equals: inviteeEmail, mode: 'insensitive' }, deletedAt: null, status: { notIn: ['INACTIVE', 'LOCKED'] } },
            select: { id: true },
          })
        ).map((u) => u.id);
    if (recipients.length) {
      const alreadyMember = await this.prisma.groupMember.count({ where: { groupId, userId: { in: recipients }, status: 'ACTIVE' } });
      if (alreadyMember) throw new ConflictException('This person is already a member of the group');
    }
    const pending = await this.prisma.groupInvite.findFirst({
      where: {
        groupId,
        status: 'PENDING',
        ...(dto.inviteeUserId ? { inviteeUserId: dto.inviteeUserId } : { inviteeEmail: { equals: inviteeEmail, mode: 'insensitive' } }),
      },
      select: { id: true },
    });
    if (pending) throw new ConflictException('An invitation is already pending for this person');

    const invite = await this.prisma.groupInvite.create({
      data: {
        groupId,
        invitedBy: invitedBy && invitedBy.length === 36 ? invitedBy : '00000000-0000-0000-0000-000000000000',
        inviteeUserId: dto.inviteeUserId,
        inviteeEmail,
        message: dto.message,
        status: 'PENDING',
      },
    });
    for (const recipientUserId of recipients) {
      try {
        await this.notifications.fire({
          recipientUserId,
          actorUserId: invitedBy,
          tenantId,
          type: 'GROUP_INVITE',
          title: `Invitation to join "${group.name}"`,
          body: dto.message,
          link: `/social/groups/${groupId}`,
          data: { groupId, inviteId: invite.id },
        });
      } catch (e) {
        this.logger.warn(`group invite notification failed: ${(e as Error).message}`);
      }
    }
    return { ...invite, notified: recipients.length };
  }

  /** Pending invitations addressed to the caller, with the public-safe group fields. */
  async listMyInvites(access: Pick<GroupAccess, 'userId' | 'email'>) {
    const invites = await this.prisma.groupInvite.findMany({
      where: { AND: [{ status: 'PENDING' }, this.addressedTo(access)] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, message: true, createdAt: true, group: { select: PUBLIC_GROUP_SELECT } },
    });
    return invites;
  }

  /** The managing organization withdraws a pending invitation. */
  async revokeInvite(tenantId: string, inviteId: string) {
    const invite = await this.prisma.groupInvite.findFirst({
      where: { id: requireId(inviteId, 'Invite'), group: { tenantId } },
      select: { id: true, status: true },
    });
    if (!tenantId || !invite) throw new NotFoundException('Invite not found');
    if (invite.status !== 'PENDING') throw new ConflictException(`Invite already ${invite.status.toLowerCase()}`);
    return this.prisma.groupInvite.update({ where: { id: invite.id }, data: { status: 'REVOKED', respondedAt: new Date() } });
  }

  async respondInvite(caller: Pick<Principal, 'sub' | 'email'>, inviteId: string, accept: boolean) {
    const userId = caller.sub;
    const invite = await this.prisma.groupInvite.findUnique({ where: { id: requireId(inviteId, 'Invite') } });
    if (!invite) throw new NotFoundException('Invite not found');
    // The invite must be addressed to the caller: by user id, or (email-only invites) by email.
    const callerEmail = (caller.email ?? '').trim().toLowerCase();
    const addressedToCaller = invite.inviteeUserId
      ? invite.inviteeUserId === userId
      : !!invite.inviteeEmail && !!callerEmail && invite.inviteeEmail.trim().toLowerCase() === callerEmail;
    if (!addressedToCaller) throw new NotFoundException('Invite not found');
    if (invite.status !== 'PENDING') {
      throw new ConflictException(`Invite already ${invite.status.toLowerCase()}`);
    }
    const wasActiveMember =
      (await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: invite.groupId, userId } } }))
        ?.status === 'ACTIVE';
    const updated = await this.prisma.groupInvite.update({
      where: { id: invite.id },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
    if (accept) {
      await this.prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId } },
        // never downgrade an existing owner/admin through an invite
        update: { status: 'ACTIVE' },
        create: { groupId: invite.groupId, userId, role: 'MEMBER', status: 'ACTIVE' },
      });
      if (!wasActiveMember) {
        await this.prisma.tripGroup.update({
          where: { id: invite.groupId },
          data: { enrolledCount: { increment: 1 } },
        });
      }
    }
    // The invitation is answered, so its notification is settled too.
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, type: 'GROUP_INVITE', readAt: null, data: { path: ['inviteId'], equals: invite.id } },
      data: { readAt: new Date() },
    });
    return updated;
  }

  // ─── Discussion (posts + comments) ───────────────────────────────────
  private async authorsById(ids: string[]) {
    const unique = [...new Set(ids)];
    const users = unique.length
      ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    return new Map(users.map((u) => [u.id, u]));
  }

  /** Newest first, pinned posts leading; paginated. */
  async listPosts(access: GroupAccess, groupId: string, query: { page?: number; limit?: number } = {}) {
    const group = await this.contentGroup(access, groupId, 'read');
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 20)));
    const [posts, total] = await Promise.all([
      this.prisma.groupPost.findMany({
        where: { groupId: group.id },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { comments: true } } },
      }),
      this.prisma.groupPost.count({ where: { groupId: group.id } }),
    ]);
    const byId = await this.authorsById(posts.map((p) => p.authorId));
    const items = posts.map((p) => {
      const isMine = p.authorId === access.userId;
      return {
        ...p,
        author: byId.has(p.authorId) ? { id: p.authorId, firstName: byId.get(p.authorId)!.firstName, lastName: byId.get(p.authorId)!.lastName } : null,
        authorName: personName(byId.get(p.authorId)),
        commentCount: p._count.comments,
        isMine,
        canDelete: isMine || group.manages,
      };
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createPost(access: GroupAccess, groupId: string, dto: { body: string; mediaUrls?: string[]; isPinned?: boolean }) {
    const group = await this.contentGroup(access, groupId, 'write');
    if (!dto.body || !dto.body.trim()) throw new BadRequestException('Post body is required');
    return this.prisma.groupPost.create({
      data: {
        groupId: group.id,
        authorId: access.userId,
        body: dto.body.trim(),
        mediaUrls: dto.mediaUrls ?? [],
        // only the managing organization can pin
        isPinned: group.manages ? dto.isPinned ?? false : false,
      },
    });
  }

  /** Loads a post the caller may see (managing organization or active member of its group). */
  private async contentPost(access: GroupAccess, postId: string, need: 'read' | 'write') {
    const post = await this.prisma.groupPost.findUnique({
      where: { id: requireId(postId, 'Post') },
      select: { id: true, groupId: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    try {
      const group = await this.contentGroup(access, post.groupId, need);
      return { post, group };
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      throw new NotFoundException('Post not found');
    }
  }

  /** The managing organization (with crm:pilgrim:update), or the post's author, may delete. */
  async deletePost(access: GroupAccess, postId: string) {
    const safeId = requireId(postId, 'Post');
    const post = await this.prisma.groupPost.findFirst({
      where: {
        id: safeId,
        OR: [
          ...(access.tenantId && access.canUpdate ? [{ group: { tenantId: access.tenantId } }] : []),
          ...(access.userId ? [{ authorId: access.userId }] : []),
        ],
      },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    await this.prisma.$transaction([
      this.prisma.groupPostComment.deleteMany({ where: { postId: post.id } }),
      this.prisma.groupPost.delete({ where: { id: post.id } }),
    ]);
    return { id: post.id, deleted: true };
  }

  async listComments(access: GroupAccess, postId: string) {
    const { post, group } = await this.contentPost(access, postId, 'read');
    const comments = await this.prisma.groupPostComment.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const byId = await this.authorsById(comments.map((c) => c.authorId));
    return comments.map((c) => {
      const isMine = c.authorId === access.userId;
      return {
        ...c,
        author: byId.has(c.authorId) ? { id: c.authorId, firstName: byId.get(c.authorId)!.firstName, lastName: byId.get(c.authorId)!.lastName } : null,
        authorName: personName(byId.get(c.authorId)),
        isMine,
        canDelete: isMine || group.manages,
      };
    });
  }

  async createComment(access: GroupAccess, postId: string, body: string) {
    if (!body || !body.trim()) throw new BadRequestException('Comment body is required');
    const { post } = await this.contentPost(access, postId, 'write');
    return this.prisma.groupPostComment.create({ data: { postId: post.id, authorId: access.userId, body: body.trim() } });
  }

  /** The comment's author, or the managing organization (with crm:pilgrim:update), may delete it. */
  async deleteComment(access: GroupAccess, postId: string, commentId: string) {
    const { post, group } = await this.contentPost(access, postId, 'read');
    const comment = await this.prisma.groupPostComment.findFirst({
      where: { id: requireId(commentId, 'Comment'), postId: post.id },
      select: { id: true, authorId: true },
    });
    if (!comment || (comment.authorId !== access.userId && !group.manages)) throw new NotFoundException('Comment not found');
    await this.prisma.groupPostComment.delete({ where: { id: comment.id } });
    return { id: comment.id, deleted: true };
  }

  // ─── Polls ───────────────────────────────────────────────────────────
  /**
   * Polls with their tally and the caller's own choice. Individual votes (who
   * chose what) are not exposed to other members.
   */
  async listPolls(access: GroupAccess, groupId: string) {
    const group = await this.contentGroup(access, groupId, 'read');
    const polls = await this.prisma.groupPoll.findMany({
      where: { groupId: group.id },
      orderBy: { createdAt: 'desc' },
      include: { votes: { select: { userId: true, optionIndex: true } } },
    });
    const now = Date.now();
    return polls.map(({ votes, ...p }) => ({
      ...p,
      voteCount: votes.length,
      voterCount: new Set(votes.map((v) => v.userId)).size,
      breakdown: this.tallyPoll(votes, (p.options as any[]) ?? []),
      myVotes: votes.filter((v) => v.userId === access.userId).map((v) => v.optionIndex),
      isClosed: p.status === 'CLOSED' || (!!p.closesAt && p.closesAt.getTime() <= now),
      canClose: p.status !== 'CLOSED' && (group.manages || p.authorId === access.userId),
    }));
  }

  async createPoll(tenantId: string, groupId: string, authorId: string, dto: { question: string; options: string[]; isMultiple?: boolean; closesAt?: string }) {
    await this.manageGroup(tenantId, groupId);
    const options = (dto.options ?? []).map((o) => String(o).trim()).filter(Boolean);
    if (!dto.question?.trim() || options.length < 2) {
      throw new BadRequestException('Poll must have a question and at least 2 options');
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      throw new BadRequestException('Poll options must be different from each other');
    }
    if (dto.closesAt && new Date(dto.closesAt).getTime() <= Date.now()) {
      throw new BadRequestException('The closing time must be in the future');
    }
    return this.prisma.groupPoll.create({
      data: {
        groupId,
        authorId,
        question: dto.question.trim(),
        options: options.map((label, index) => ({ index, label })),
        isMultiple: dto.isMultiple ?? false,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      },
    });
  }

  async vote(access: GroupAccess, pollId: string, optionIndices: number[]) {
    const poll = await this.prisma.groupPoll.findUnique({ where: { id: requireId(pollId, 'Poll') } });
    if (!poll) throw new NotFoundException('Poll not found');
    try {
      await this.contentGroup(access, poll.groupId, 'read');
    } catch {
      throw new NotFoundException('Poll not found');
    }
    if (poll.status === 'CLOSED' || (poll.closesAt && poll.closesAt.getTime() <= Date.now())) {
      throw new ForbiddenException('Poll is closed');
    }
    const validIndices = new Set(
      ((poll.options as any[]) ?? []).map((o) => Number(o?.index)).filter((n) => Number.isInteger(n)),
    );
    optionIndices = [...new Set(optionIndices ?? [])];
    if (!optionIndices.length) throw new BadRequestException('Select at least one option');
    if (optionIndices.some((i) => !Number.isInteger(i) || !validIndices.has(i))) {
      throw new BadRequestException('Invalid poll option');
    }
    if (!poll.isMultiple && optionIndices.length > 1) {
      throw new BadRequestException('This poll accepts a single option');
    }
    // Replace the caller's previous choice atomically.
    await this.prisma.$transaction([
      this.prisma.groupPollVote.deleteMany({ where: { pollId: poll.id, userId: access.userId } }),
      this.prisma.groupPollVote.createMany({ data: optionIndices.map((i) => ({ pollId: poll.id, userId: access.userId, optionIndex: i })) }),
    ]);
    return { success: true, myVotes: optionIndices };
  }

  /** The managing organization or the poll's author may close it. */
  async closePoll(tenantId: string, userId: string, pollId: string) {
    const poll = await this.prisma.groupPoll.findFirst({
      where: {
        id: requireId(pollId, 'Poll'),
        OR: [
          ...(tenantId ? [{ group: { tenantId } }] : []),
          ...(userId ? [{ authorId: userId }] : []),
        ],
      },
      select: { id: true },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    return this.prisma.groupPoll.update({ where: { id: poll.id }, data: { status: 'CLOSED' } });
  }

  private tallyPoll(votes: { optionIndex: number }[], options: any[]) {
    const counts: Record<number, number> = {};
    for (const v of votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
    return options.map((opt) => ({ ...opt, count: counts[opt.index] ?? 0 }));
  }

  // ─── Notes ───────────────────────────────────────────────────────────
  async listNotes(tenantId: string, groupId: string) {
    await this.manageGroup(tenantId, groupId);
    return this.prisma.groupNote.findMany({
      where: { groupId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createNote(tenantId: string, groupId: string, authorId: string, dto: { title: string; body?: string; category?: string; pinned?: boolean }) {
    await this.manageGroup(tenantId, groupId);
    if (!dto.title?.trim()) throw new BadRequestException('Note title is required');
    return this.prisma.groupNote.create({
      data: {
        groupId,
        authorId,
        title: dto.title.trim(),
        body: dto.body,
        category: dto.category ?? 'GENERAL',
        pinned: dto.pinned ?? false,
      },
    });
  }

  private async ownedNote(tenantId: string, noteId: string) {
    const safeId = requireId(noteId, 'Note');
    if (!tenantId) throw new NotFoundException('Note not found');
    const note = await this.prisma.groupNote.findFirst({
      where: { id: safeId, group: { tenantId } },
      select: { id: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  async updateNote(tenantId: string, noteId: string, dto: any) {
    await this.ownedNote(tenantId, noteId);
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.pinned !== undefined) data.pinned = dto.pinned;
    return this.prisma.groupNote.update({ where: { id: noteId }, data });
  }

  async deleteNote(tenantId: string, noteId: string) {
    await this.ownedNote(tenantId, noteId);
    return this.prisma.groupNote.delete({ where: { id: noteId } });
  }

  // ─── Documents (shared links; files are not uploaded here) ────────────
  async listDocuments(tenantId: string, groupId: string) {
    await this.manageGroup(tenantId, groupId);
    return this.prisma.groupDocument.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(tenantId: string, groupId: string, uploaderId: string, dto: { name: string; url: string; mimeType?: string; sizeBytes?: number; description?: string }) {
    await this.manageGroup(tenantId, groupId);
    if (!dto.name?.trim() || !dto.url?.trim()) throw new BadRequestException('Name and URL are required');
    return this.prisma.groupDocument.create({
      data: {
        groupId,
        uploaderId: uploaderId && uploaderId.length === 36 ? uploaderId : '00000000-0000-0000-0000-000000000000',
        name: dto.name.trim(),
        url: dto.url.trim(),
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        description: dto.description,
      },
    });
  }

  async deleteDocument(tenantId: string, documentId: string) {
    // GroupDocument has no relation to TripGroup, so resolve the group explicitly.
    const doc = await this.prisma.groupDocument.findUnique({
      where: { id: requireId(documentId, 'Document') },
      select: { id: true, groupId: true },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const owned = tenantId
      ? await this.prisma.tripGroup.findFirst({ where: { id: doc.groupId, tenantId }, select: { id: true } })
      : null;
    if (!owned) throw new NotFoundException('Document not found');
    return this.prisma.groupDocument.delete({ where: { id: doc.id } });
  }

  // ─── Related entities (read-only links) ──────────────────────────────
  async getRelated(tenantId: string, groupId: string) {
    await this.manageGroup(tenantId, groupId);
    const [bookings, assignments] = await Promise.all([
      this.prisma.booking.findMany({
        where: { groupId, tenantId },
        select: {
          id: true,
          bookingRef: true,
          status: true,
          package: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.transportAssignment.findMany({
        where: { groupId, tenantId },
        select: {
          id: true,
          scheduledAt: true,
          status: true,
          vehicle: { select: { id: true, plateNumber: true } },
          route: { select: { id: true, name: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 10,
      }),
    ]);
    return { bookings, transportAssignments: assignments };
  }

  // ─── Bookings linkage (legacy) ───────────────────────────────────────
  async addPilgrim(tenantId: string, groupId: string, bookingId: string) {
    await this.manageGroup(tenantId, groupId);
    const booking = await findOwned<{ id: string; groupId: string | null }>(
      this.prisma.booking, bookingId, tenantId, 'Booking', {}, { id: true, groupId: true },
    );
    const updated = await this.prisma.booking.update({ where: { id: booking.id }, data: { groupId } });
    if (booking.groupId !== groupId) {
      await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { increment: 1 } } });
    }
    return updated;
  }

  // ─── Incidents ──────────────────────────────────────────────────────
  async getIncidents(tenantId: string, groupId: string) {
    return this.prisma.incident.findMany({
      where: { tenantId, groupId: requireId(groupId, 'Group') },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createIncident(tenantId: string, groupId: string, reportedBy: string, dto: any) {
    await this.manageGroup(tenantId, groupId);
    await assertOwnedIfPresent(this.prisma.pilgrim, dto.pilgrimId, tenantId, 'Pilgrim', { deletedAt: null });
    const description = String(dto.description ?? dto.title ?? '').trim();
    if (!description) throw new BadRequestException('Describe the incident');
    return this.prisma.incident.create({
      data: {
        tenantId,
        groupId,
        reportedBy: reportedBy && reportedBy.length === 36 ? reportedBy : null,
        type: dto.type ?? 'OTHER',
        severity: dto.severity ?? 'MEDIUM',
        description,
        location: dto.location,
        pilgrimId: dto.pilgrimId,
      },
    });
  }

  async updateIncident(tenantId: string, groupId: string, incidentId: string, dto: any) {
    const incident = await findOwned<{ id: string }>(
      this.prisma.incident, incidentId, tenantId, 'Incident', { groupId: requireId(groupId, 'Group') }, { id: true },
    );
    const data: any = {};
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.resolution !== undefined) data.resolution = dto.resolution;
    if (dto.resolvedAt !== undefined) data.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;
    if (dto.description !== undefined) data.description = dto.description;
    return this.prisma.incident.update({ where: { id: incident.id }, data });
  }

  async getStats(tenantId: string) {
    const [total, active, completed, incidents, openIncidents] = await Promise.all([
      this.prisma.tripGroup.count({ where: { tenantId } }),
      this.prisma.tripGroup.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.tripGroup.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.incident.count({ where: { tenantId } }),
      this.prisma.incident.count({ where: { tenantId, resolvedAt: null } }),
    ]);
    return { total, active, completed, incidents, openIncidents };
  }
}
