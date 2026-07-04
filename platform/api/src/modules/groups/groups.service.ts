import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

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
        include: { _count: { select: { members: true, posts: true } } },
      }),
      this.prisma.tripGroup.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.tripGroup.findFirst({
      where: { id, OR: [{ tenantId }, { visibility: 'PUBLIC' }] },
      include: {
        incidents: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { members: true, posts: true, notes: true, polls: true, incidents: true } },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async create(tenantId: string, createdBy: string, dto: any) {
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
    await this.findOne(tenantId, id);
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
    await this.findOne(tenantId, id);
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
    await this.findOne(tenantId, groupId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
    });
    // Hydrate user info (email/role) — best effort, ignore missing
    const userIds = members.map((m) => m.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } } })
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

  async addMember(tenantId: string, groupId: string, userId: string, role: string = 'MEMBER') {
    await this.findOne(tenantId, groupId);
    const existing = await this.prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (existing) {
      return this.prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { status: 'ACTIVE', role: role || existing.role },
      });
    }
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
    await this.findOne(tenantId, groupId);
    await this.prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId } } }).catch(() => undefined);
    await this.prisma.tripGroup.update({
      where: { id: groupId },
      data: { enrolledCount: { decrement: 1 } },
    }).catch(() => undefined);
    return { success: true };
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
    await this.prisma.groupMember.delete({ where: { groupId_userId: { groupId, userId } } }).catch(() => undefined);
    await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { decrement: 1 } } }).catch(() => undefined);
    return { left: true };
  }

  // ─── Invites ─────────────────────────────────────────────────────────
  async listInvites(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
    return this.prisma.groupInvite.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvite(tenantId: string, groupId: string, invitedBy: string, dto: { inviteeUserId?: string; inviteeEmail?: string; message?: string }) {
    await this.findOne(tenantId, groupId);
    if (!dto.inviteeUserId && !dto.inviteeEmail) {
      throw new Error('inviteeUserId or inviteeEmail required');
    }
    const invite = await this.prisma.groupInvite.create({
      data: {
        groupId,
        invitedBy: invitedBy && invitedBy.length === 36 ? invitedBy : '00000000-0000-0000-0000-000000000000',
        inviteeUserId: dto.inviteeUserId,
        inviteeEmail: dto.inviteeEmail,
        message: dto.message,
        status: 'PENDING',
      },
    });
    if (dto.inviteeUserId) {
      const grp = await this.prisma.tripGroup.findUnique({ where: { id: groupId } });
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

  async respondInvite(userId: string, inviteId: string, accept: boolean) {
    const invite = await this.prisma.groupInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.inviteeUserId && invite.inviteeUserId !== userId) {
      throw new ForbiddenException('Invite does not belong to you');
    }
    const updated = await this.prisma.groupInvite.update({
      where: { id: inviteId },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    });
    if (accept) {
      await this.prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId } },
        update: { status: 'ACTIVE', role: 'MEMBER' },
        create: { groupId: invite.groupId, userId, role: 'MEMBER', status: 'ACTIVE' },
      });
      await this.prisma.tripGroup.update({
        where: { id: invite.groupId },
        data: { enrolledCount: { increment: 1 } },
      });
    }
    return updated;
  }

  // ─── Discussion (posts + comments) ───────────────────────────────────
  async listPosts(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
    const posts = await this.prisma.groupPost.findMany({
      where: { groupId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { comments: true } } },
    });
    // Hydrate authors
    const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
    const users = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } } })
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
    await this.findOne(tenantId, groupId);
    if (!dto.body || !dto.body.trim()) throw new Error('Post body is required');
    return this.prisma.groupPost.create({
      data: {
        groupId,
        authorId,
        body: dto.body,
        mediaUrls: dto.mediaUrls ?? [],
        isPinned: dto.isPinned ?? false,
      },
    });
  }

  async deletePost(tenantId: string, postId: string) {
    return this.prisma.groupPost.delete({ where: { id: postId } });
  }

  async listComments(postId: string) {
    const comments = await this.prisma.groupPostComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
    const authorIds = Array.from(new Set(comments.map((c) => c.authorId)));
    const users = authorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: authorIds } } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return comments.map((c) => ({
      ...c,
      author: byId.get(c.authorId)
        ? { id: c.authorId, firstName: byId.get(c.authorId)!.firstName, lastName: byId.get(c.authorId)!.lastName }
        : null,
    }));
  }

  async createComment(postId: string, authorId: string, body: string) {
    if (!body || !body.trim()) throw new Error('Comment body is required');
    return this.prisma.groupPostComment.create({ data: { postId, authorId, body } });
  }

  // ─── Polls ───────────────────────────────────────────────────────────
  async listPolls(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
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
    await this.findOne(tenantId, groupId);
    if (!dto.question || !dto.options || dto.options.length < 2) {
      throw new Error('Poll must have a question and at least 2 options');
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

  async vote(pollId: string, userId: string, optionIndices: number[]) {
    const poll = await this.prisma.groupPoll.findUnique({ where: { id: pollId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.status === 'CLOSED') throw new ForbiddenException('Poll is closed');
    if (!poll.isMultiple && optionIndices.length > 1) optionIndices = [optionIndices[0]];
    // Clear previous votes by this user
    await this.prisma.groupPollVote.deleteMany({ where: { pollId, userId } });
    await this.prisma.groupPollVote.createMany({
      data: optionIndices.map((i) => ({ pollId, userId, optionIndex: i })),
    });
    return { success: true };
  }

  async closePoll(pollId: string) {
    return this.prisma.groupPoll.update({ where: { id: pollId }, data: { status: 'CLOSED' } });
  }

  private tallyPoll(votes: { optionIndex: number }[], options: any[]) {
    const counts: Record<number, number> = {};
    for (const v of votes) counts[v.optionIndex] = (counts[v.optionIndex] ?? 0) + 1;
    return options.map((opt) => ({ ...opt, count: counts[opt.index] ?? 0 }));
  }

  // ─── Notes ───────────────────────────────────────────────────────────
  async listNotes(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
    return this.prisma.groupNote.findMany({
      where: { groupId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createNote(tenantId: string, groupId: string, authorId: string, dto: { title: string; body?: string; category?: string; pinned?: boolean }) {
    await this.findOne(tenantId, groupId);
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

  async updateNote(noteId: string, dto: any) {
    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.pinned !== undefined) data.pinned = dto.pinned;
    return this.prisma.groupNote.update({ where: { id: noteId }, data });
  }

  async deleteNote(noteId: string) {
    return this.prisma.groupNote.delete({ where: { id: noteId } });
  }

  // ─── Documents ───────────────────────────────────────────────────────
  async listDocuments(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
    return this.prisma.groupDocument.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addDocument(tenantId: string, groupId: string, uploaderId: string, dto: { name: string; url: string; mimeType?: string; sizeBytes?: number; description?: string }) {
    await this.findOne(tenantId, groupId);
    if (!dto.name?.trim() || !dto.url?.trim()) throw new Error('Name and URL are required');
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

  async deleteDocument(documentId: string) {
    return this.prisma.groupDocument.delete({ where: { id: documentId } });
  }

  // ─── Related entities (read-only links) ──────────────────────────────
  async getRelated(tenantId: string, groupId: string) {
    await this.findOne(tenantId, groupId);
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
    await this.findOne(tenantId, groupId);
    const updated = await this.prisma.booking.update({ where: { id: bookingId }, data: { groupId } });
    await this.prisma.tripGroup.update({ where: { id: groupId }, data: { enrolledCount: { increment: 1 } } });
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

  async updateIncident(tenantId: string, incidentId: string, dto: any) {
    const data: any = {};
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.resolution !== undefined) data.resolution = dto.resolution;
    if (dto.resolvedAt !== undefined) data.resolvedAt = dto.resolvedAt ? new Date(dto.resolvedAt) : null;
    if (dto.description !== undefined) data.description = dto.description;
    return this.prisma.incident.update({ where: { id: incidentId }, data });
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
