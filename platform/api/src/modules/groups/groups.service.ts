import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Principal } from '../auth/principal';
import { findOwned, assertOwnedIfPresent, requireId } from '../../common/tenant-scope';
import { PUBLIC_GROUP_SELECT } from './group-public.select';

/**
 * Access model
 *  - "manage": the group belongs to the caller's tenant. Required for every write
 *    to the group itself and for every sensitive read (member contact data, notes,
 *    documents, incidents, invites, related bookings).
 *  - "content": the caller manages the group OR is an ACTIVE member of it. Grants
 *    reading and writing the discussion (posts, comments, polls, votes).
 *  - PUBLIC groups expose only PUBLIC_GROUP_SELECT to everyone else.
 * Foreign and unknown ids always yield the same 404.
 */

@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Listing & basic CRUD ──────────────────────────────────────────────
  async findAll(tenantId: string, query: any) {
    const { status, search, visibility, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (visibility) where.visibility = visibility;
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

  // Public/discoverable groups across tenants (PUBLIC visibility)
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

  async findPublic(query: any) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (+page - 1) * +limit;
    const where: any = { visibility: 'PUBLIC' };
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

  /**
   * Detail read. The owning tenant gets the full record; anyone else gets only the
   * public-safe projection, and only when the group is PUBLIC.
   */
  async findOne(tenantId: string, id: string) {
    const safeId = requireId(id, 'Group');
    const group = await this.prisma.tripGroup.findFirst({
      where: { id: safeId, tenantId },
      include: {
        incidents: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { members: true, posts: true, notes: true, polls: true, incidents: true } },
      },
    });
    if (group) return group;
    const pub = await this.prisma.tripGroup.findFirst({
      where: { id: safeId, visibility: 'PUBLIC' },
      select: PUBLIC_GROUP_SELECT,
    });
    if (!pub) throw new NotFoundException('Group not found');
    return pub;
  }

  /** Management guard: the group must belong to the caller's tenant. */
  private async manageGroup(tenantId: string, groupId: string) {
    return findOwned<{ id: string; tenantId: string; name: string }>(
      this.prisma.tripGroup, groupId, tenantId, 'Group', {}, { id: true, tenantId: true, name: true },
    );
  }

  /** Content guard: caller's tenant owns the group, or the caller is an ACTIVE member. */
  private async contentGroup(tenantId: string, userId: string, groupId: string) {
    const safeId = requireId(groupId, 'Group');
    const group = await this.prisma.tripGroup.findFirst({
      where: {
        id: safeId,
        OR: [
          ...(tenantId ? [{ tenantId }] : []),
          ...(userId ? [{ members: { some: { userId, status: 'ACTIVE' } } }] : []),
        ],
      },
      select: { id: true, tenantId: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    return { ...group, managed: !!tenantId && group.tenantId === tenantId };
  }

  private async callerGroupRole(groupId: string, userId: string) {
    if (!userId) return null;
    const m = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { role: true, status: true },
    });
    return m && m.status === 'ACTIVE' ? m.role : null;
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
        status: dto.status ?? 'PLANNING',
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
    if (dto.status !== undefined) data.status = dto.status;
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

  async remove(tenantId: string, id: string) {
    await this.manageGroup(tenantId, id);
    // Cascade-delete related rows then delete the group
    await this.prisma.groupMember.deleteMany({ where: { groupId: id } });
    await this.prisma.groupInvite.deleteMany({ where: { groupId: id } });
    await this.prisma.groupNote.deleteMany({ where: { groupId: id } });
    await this.prisma.groupPostComment.deleteMany({ where: { post: { groupId: id } } });
    await this.prisma.groupPost.deleteMany({ where: { groupId: id } });
    await this.prisma.groupPollVote.deleteMany({ where: { poll: { groupId: id } } });
    await this.prisma.groupPoll.deleteMany({ where: { groupId: id } });
    return this.prisma.tripGroup.delete({ where: { id } });
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
    return members.map((m) => ({
      ...m,
      user: byId.get(m.userId)
        ? {
            id: byId.get(m.userId)!.id,
            email: byId.get(m.userId)!.email,
            firstName: byId.get(m.userId)!.firstName,
            lastName: byId.get(m.userId)!.lastName,
          }
        : null,
    }));
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
    role = role || 'MEMBER';
    const m = await this.prisma.groupMember.create({
      data: { groupId, userId, role, status: 'ACTIVE' },
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

  // ─── Self-service join/leave — travelers, PUBLIC groups only ─────────
  async selfJoin(groupId: string, userId: string) {
    const group = await this.prisma.tripGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException(`Group ${groupId} not found`);
    if ((group as any).visibility !== 'PUBLIC') {
      throw new ForbiddenException('Only public groups can be joined directly — ask for an invite.');
    }
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) {
      if (existing.status === 'ACTIVE') return existing;
      return this.prisma.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { status: 'ACTIVE' } });
    }
    const m = await this.prisma.groupMember.create({ data: { groupId, userId, role: 'MEMBER', status: 'ACTIVE' } });
    await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { increment: 1 } } });
    return m;
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

  async createInvite(tenantId: string, groupId: string, invitedBy: string, dto: { inviteeUserId?: string; inviteeEmail?: string; message?: string }) {
    const group = await this.manageGroup(tenantId, groupId);
    if (!dto.inviteeUserId && !dto.inviteeEmail) {
      throw new BadRequestException('inviteeUserId or inviteeEmail required');
    }
    // Users outside the caller's organization can only be invited by email.
    if (dto.inviteeUserId) await this.assertTenantUser(tenantId, dto.inviteeUserId, 'Invitee');
    const inviteeEmail = dto.inviteeEmail ? dto.inviteeEmail.trim().toLowerCase() : undefined;
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
    if (dto.inviteeUserId) {
      const grp = group;
      await this.notifications.fire({
        recipientUserId: dto.inviteeUserId,
        actorUserId: invitedBy,
        tenantId,
        type: 'GROUP_INVITE',
        title: `Invitation to "${grp?.name ?? 'a group'}"`,
        body: dto.message,
        link: `/groups/${groupId}`,
        data: { groupId, inviteId: invite.id },
      });
    }
    return invite;
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
      where: { id: inviteId },
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
    return updated;
  }

  // ─── Discussion (posts + comments) ───────────────────────────────────
  async listPosts(tenantId: string, userId: string, groupId: string) {
    await this.contentGroup(tenantId, userId, groupId);
    const posts = await this.prisma.groupPost.findMany({
      where: { groupId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { comments: true } } },
    });
    // Hydrate authors
    const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
    const users = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return posts.map((p) => ({
      ...p,
      author: byId.get(p.authorId)
        ? { id: p.authorId, firstName: byId.get(p.authorId)!.firstName, lastName: byId.get(p.authorId)!.lastName }
        : null,
    }));
  }

  async createPost(tenantId: string, groupId: string, authorId: string, dto: { body: string; mediaUrls?: string[]; isPinned?: boolean }) {
    const group = await this.contentGroup(tenantId, authorId, groupId);
    if (!dto.body || !dto.body.trim()) throw new BadRequestException('Post body is required');
    return this.prisma.groupPost.create({
      data: {
        groupId,
        authorId,
        body: dto.body,
        mediaUrls: dto.mediaUrls ?? [],
        // only the managing organization can pin
        isPinned: group.managed ? dto.isPinned ?? false : false,
      },
    });
  }

  /** Loads a post the caller may see (managing tenant or active member of its group). */
  private async contentPost(tenantId: string, userId: string, postId: string) {
    const post = await this.prisma.groupPost.findUnique({
      where: { id: requireId(postId, 'Post') },
      select: { id: true, groupId: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    try {
      const group = await this.contentGroup(tenantId, userId, post.groupId);
      return { post, group };
    } catch {
      throw new NotFoundException('Post not found');
    }
  }

  /** The managing organization, or the post's author (while still able to see it), may delete. */
  async deletePost(tenantId: string, userId: string, postId: string) {
    const safeId = requireId(postId, 'Post');
    const post = await this.prisma.groupPost.findFirst({
      where: {
        id: safeId,
        OR: [
          ...(tenantId ? [{ group: { tenantId } }] : []),
          ...(userId ? [{ authorId: userId }] : []),
        ],
      },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    return this.prisma.groupPost.delete({ where: { id: post.id } });
  }

  async listComments(tenantId: string, userId: string, postId: string) {
    await this.contentPost(tenantId, userId, postId);
    const comments = await this.prisma.groupPostComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
    const authorIds = Array.from(new Set(comments.map((c) => c.authorId)));
    const users = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return comments.map((c) => ({
      ...c,
      author: byId.get(c.authorId)
        ? { id: c.authorId, firstName: byId.get(c.authorId)!.firstName, lastName: byId.get(c.authorId)!.lastName }
        : null,
    }));
  }

  async createComment(tenantId: string, postId: string, authorId: string, body: string) {
    if (!body || !body.trim()) throw new BadRequestException('Comment body is required');
    const { post } = await this.contentPost(tenantId, authorId, postId);
    return this.prisma.groupPostComment.create({ data: { postId: post.id, authorId, body } });
  }

  // ─── Polls ───────────────────────────────────────────────────────────
  async listPolls(tenantId: string, userId: string, groupId: string) {
    await this.contentGroup(tenantId, userId, groupId);
    const polls = await this.prisma.groupPoll.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: { votes: true },
    });
    return polls.map((p) => ({
      ...p,
      voteCount: p.votes.length,
      breakdown: this.tallyPoll(p.votes, (p.options as any[]) ?? []),
    }));
  }

  async createPoll(tenantId: string, groupId: string, authorId: string, dto: { question: string; options: string[]; isMultiple?: boolean; closesAt?: string }) {
    await this.contentGroup(tenantId, authorId, groupId);
    if (!dto.question || !dto.options || dto.options.length < 2) {
      throw new BadRequestException('Poll must have a question and at least 2 options');
    }
    const optionsJson = dto.options.map((label, index) => ({ index, label }));
    return this.prisma.groupPoll.create({
      data: {
        groupId,
        authorId,
        question: dto.question,
        options: optionsJson,
        isMultiple: dto.isMultiple ?? false,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : undefined,
      },
    });
  }

  async vote(tenantId: string, pollId: string, userId: string, optionIndices: number[]) {
    const poll = await this.prisma.groupPoll.findUnique({ where: { id: requireId(pollId, 'Poll') } });
    if (!poll) throw new NotFoundException('Poll not found');
    try {
      await this.contentGroup(tenantId, userId, poll.groupId);
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
    // Clear previous votes by this user
    await this.prisma.groupPollVote.deleteMany({ where: { pollId, userId } });
    await this.prisma.groupPollVote.createMany({
      data: optionIndices.map((i) => ({ pollId, userId, optionIndex: i })),
    });
    return { success: true };
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
    return this.prisma.groupNote.create({
      data: {
        groupId,
        authorId,
        title: dto.title,
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

  // ─── Documents ───────────────────────────────────────────────────────
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

  // ─── Incidents (legacy) ─────────────────────────────────────────────
  async getIncidents(tenantId: string, groupId: string) {
    return this.prisma.incident.findMany({
      where: { tenantId, groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createIncident(tenantId: string, groupId: string, reportedBy: string, dto: any) {
    await this.manageGroup(tenantId, groupId);
    await assertOwnedIfPresent(this.prisma.pilgrim, dto.pilgrimId, tenantId, 'Pilgrim', { deletedAt: null });
    return this.prisma.incident.create({
      data: {
        tenantId,
        groupId,
        reportedBy: reportedBy && reportedBy.length === 36 ? reportedBy : null,
        type: dto.type ?? 'OTHER',
        severity: dto.severity ?? 'MEDIUM',
        description: dto.description ?? dto.title ?? '',
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
    const [total, active, completed, incidents] = await Promise.all([
      this.prisma.tripGroup.count({ where: { tenantId } }),
      this.prisma.tripGroup.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.tripGroup.count({ where: { tenantId, status: 'COMPLETED' } }),
      this.prisma.incident.count({ where: { tenantId } }),
    ]);
    return { total, active, completed, incidents };
  }
}
