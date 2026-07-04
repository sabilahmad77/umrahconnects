import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getOrCreateSocialAccount(userId: string, tenantId: string) {
    let account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) {
      account = await this.prisma.socialAccount.create({
        data: { userId, type: 'OPERATOR' as any, displayName: 'User' },
      });
    }
    return account;
  }

  // ── Feed ────────────────────────────────────────────────────────────────────

  async getFeed(tenantId: string, userId: string, query: any) {
    const { page = 1, limit = 20, type, followingOnly } = query;
    const skip = (+page - 1) * +limit;

    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });

    const where: any = { deletedAt: null, visibility: 'PUBLIC' };
    if (type) where.type = type;

    if (followingOnly && account) {
      const follows = await this.prisma.follow.findMany({
        where: { followerId: account.id },
        select: { followedId: true },
      });
      where.authorId = { in: follows.map(f => f.followedId) };
      delete where.visibility;
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: +limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true, isVerified: true } },
          comments: {
            where: { deletedAt: null, parentId: null },
            take: 2,
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items: posts, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  // ── Posts ───────────────────────────────────────────────────────────────────

  async createPost(tenantId: string, userId: string, dto: any) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    return this.prisma.post.create({
      data: {
        authorId: account.id,
        type: dto.type ?? 'UPDATE',
        body: dto.body ?? dto.content ?? '',
        visibility: dto.visibility ?? 'PUBLIC',
        mediaUrls: dto.mediaUrls ?? [],
        tags: dto.tags ?? [],
        language: dto.language ?? 'ar',
        targetRoles: dto.targetRoles ?? [],
      },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async findOnePost(id: string) {
    const post = await this.prisma.post.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, isVerified: true } },
        comments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  // Alias for controller
  getPost = this.findOnePost.bind(this);

  async updatePost(tenantId: string, userId: string, id: string, dto: any) {
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) throw new NotFoundException('Social account not found');

    const post = await this.prisma.post.findFirst({ where: { id, authorId: account.id, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);

    const data: any = { updatedAt: new Date() };
    if (dto.body !== undefined || dto.content !== undefined) data.body = dto.body ?? dto.content;
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    if (dto.tags !== undefined) data.tags = dto.tags;

    return this.prisma.post.update({ where: { id }, data });
  }

  async deletePost(tenantId: string, userId: string, id: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) throw new NotFoundException('Social account not found');

    const post = await this.prisma.post.findFirst({ where: { id, authorId: account.id, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);

    return this.prisma.post.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  async addComment(tenantId: string, userId: string, postId: string, dto: any) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    const post = await this.prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId: account.id,
        body: dto.body ?? dto.content ?? '',
        parentId: dto.parentId ?? null,
      },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
    });

    await this.prisma.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });

    // Notify the post author (or comment parent author for replies)
    try {
      const postAuthor = await this.prisma.socialAccount.findUnique({ where: { id: post.authorId } });
      if (postAuthor && postAuthor.userId !== userId) {
        await this.notifications.fire({
          tenantId,
          recipientUserId: postAuthor.userId,
          actorUserId: userId,
          type: dto.parentId ? 'COMMENT_REPLY' : 'POST_COMMENT',
          title: dto.parentId ? 'New reply on your comment' : 'New comment on your post',
          body: (comment.body ?? '').slice(0, 140),
          link: `/social?post=${postId}`,
          data: { postId, commentId: comment.id },
        });
      }
    } catch { /* notifications are best-effort */ }

    return comment;
  }

  async updateComment(tenantId: string, userId: string, postId: string, commentId: string, body: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) throw new NotFoundException('Social account not found');

    const comment = await this.prisma.comment.findFirst({ where: { id: commentId, postId, authorId: account.id, deletedAt: null } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    return this.prisma.comment.update({ where: { id: commentId }, data: { body } });
  }

  async deleteComment(tenantId: string, userId: string, postId: string, commentId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) throw new NotFoundException('Social account not found');

    const comment = await this.prisma.comment.findFirst({ where: { id: commentId, postId, authorId: account.id, deletedAt: null } });
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    await this.prisma.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    await this.prisma.post.update({ where: { id: postId }, data: { commentCount: { decrement: 1 } } });
    return { deleted: true };
  }

  // ── Reactions ─────────────────────────────────────────────────────────────────

  async toggleReaction(tenantId: string, userId: string, postId: string, dto: any) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    const post = await this.prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);

    // Accept dto as object, string, or undefined; also accept `reaction` alias for `type`
    const reactionType =
      (typeof dto === 'string' ? dto : (dto?.type ?? dto?.reaction)) ?? 'LIKE';
    const existing = await this.prisma.reaction.findFirst({ where: { postId, accountId: account.id, type: reactionType } });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
      if (reactionType === 'LIKE') await this.prisma.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } } });
      if (reactionType === 'SHARE') await this.prisma.post.update({ where: { id: postId }, data: { shareCount: { decrement: 1 } } });
      return { toggled: false, type: reactionType };
    } else {
      await this.prisma.reaction.create({ data: { postId, accountId: account.id, type: reactionType } });
      if (reactionType === 'LIKE') await this.prisma.post.update({ where: { id: postId }, data: { likeCount: { increment: 1 } } });
      if (reactionType === 'SHARE') await this.prisma.post.update({ where: { id: postId }, data: { shareCount: { increment: 1 } } });

      // Notify post author for LIKE/SHARE
      try {
        if (['LIKE', 'SHARE'].includes(reactionType)) {
          const postAuthor = await this.prisma.socialAccount.findUnique({ where: { id: post.authorId } });
          if (postAuthor && postAuthor.userId !== userId) {
            await this.notifications.fire({
              tenantId,
              recipientUserId: postAuthor.userId,
              actorUserId: userId,
              type: 'POST_REACTION',
              title: reactionType === 'LIKE' ? 'Someone liked your post' : 'Someone shared your post',
              link: `/social?post=${postId}`,
              data: { postId, type: reactionType },
            });
          }
        }
      } catch { /* best-effort */ }

      return { toggled: true, type: reactionType };
    }
  }

  async getReactions(tenantId: string, postId: string) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    return this.prisma.reaction.findMany({ where: { postId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Follow ────────────────────────────────────────────────────────────────────

  async toggleFollow(tenantId: string, userId: string, targetAccountId: string) {
    const followerAccount = await this.getOrCreateSocialAccount(userId, tenantId);

    const targetAccount = await this.prisma.socialAccount.findFirst({ where: { id: targetAccountId } });
    if (!targetAccount) throw new NotFoundException(`Account ${targetAccountId} not found`);
    if (followerAccount.id === targetAccountId) throw new BadRequestException('Cannot follow yourself');

    const existing = await this.prisma.follow.findFirst({ where: { followerId: followerAccount.id, followedId: targetAccountId } });

    if (existing) {
      await this.prisma.follow.delete({ where: { followerId_followedId: { followerId: followerAccount.id, followedId: targetAccountId } } });
      await this.prisma.socialAccount.update({ where: { id: followerAccount.id }, data: { followingCount: { decrement: 1 } } });
      await this.prisma.socialAccount.update({ where: { id: targetAccountId }, data: { followerCount: { decrement: 1 } } });
      return { following: false };
    } else {
      await this.prisma.follow.create({ data: { followerId: followerAccount.id, followedId: targetAccountId } });
      await this.prisma.socialAccount.update({ where: { id: followerAccount.id }, data: { followingCount: { increment: 1 } } });
      await this.prisma.socialAccount.update({ where: { id: targetAccountId }, data: { followerCount: { increment: 1 } } });
      return { following: true };
    }
  }

  // ── Accounts ──────────────────────────────────────────────────────────────────

  async getAccount(id: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async getMyAccount(tenantId: string, userId: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) return this.getOrCreateSocialAccount(userId, tenantId);
    return account;
  }

  // Alias for controller
  getOrCreateAccount(tenantId: string, userId: string) {
    return this.getMyAccount(tenantId, userId);
  }

  async updateMyAccount(tenantId: string, userId: string, dto: any) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const data: any = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl;
    if (dto.coverUrl !== undefined) data.coverUrl = dto.coverUrl;
    if (dto.privacyDefault !== undefined) data.privacyDefault = dto.privacyDefault;
    // Extended traveler profile fields
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.nationality !== undefined) data.nationality = dto.nationality;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.travelInterests !== undefined) data.travelInterests = dto.travelInterests;
    if (dto.preferredDateFrom !== undefined) data.preferredDateFrom = dto.preferredDateFrom ? new Date(dto.preferredDateFrom) : null;
    if (dto.preferredDateTo !== undefined) data.preferredDateTo = dto.preferredDateTo ? new Date(dto.preferredDateTo) : null;
    if (dto.profileVisibility !== undefined) data.profileVisibility = String(dto.profileVisibility).toUpperCase();
    if (dto.contactVisibility !== undefined) data.contactVisibility = String(dto.contactVisibility).toUpperCase();
    return this.prisma.socialAccount.update({ where: { id: account.id }, data });
  }

  // ── Saved posts (bookmarks) ─────────────────────────────────────────
  async toggleSavePost(tenantId: string, userId: string, postId: string) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const existing = await this.prisma.savedPost.findUnique({ where: { accountId_postId: { accountId: account.id, postId } } });
    if (existing) {
      await this.prisma.savedPost.delete({ where: { id: existing.id } });
      await this.prisma.post.update({ where: { id: postId }, data: { saveCount: { decrement: 1 } } }).catch(() => undefined);
      return { saved: false };
    }
    await this.prisma.savedPost.create({ data: { accountId: account.id, postId } });
    await this.prisma.post.update({ where: { id: postId }, data: { saveCount: { increment: 1 } } }).catch(() => undefined);
    return { saved: true };
  }

  async listSavedPosts(tenantId: string, userId: string) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const items = await this.prisma.savedPost.findMany({
      where: { accountId: account.id },
      orderBy: { savedAt: 'desc' },
      include: { post: { include: { author: true } } },
    });
    return items.map((s) => ({ ...s.post, savedAt: s.savedAt }));
  }

  // ── Discover ─────────────────────────────────────────────────────────
  async discoverPeople(tenantId: string, userId: string, params: { limit?: number; search?: string } = {}) {
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 12)));
    const me = await this.getOrCreateSocialAccount(userId, tenantId);
    const where: any = {
      id: { not: me.id },
      isSuspended: false,
      profileVisibility: { in: ['PUBLIC', 'CONNECTIONS'] },
    };
    if (params.search) {
      where.OR = [
        { displayName: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.socialAccount.findMany({
      where,
      take: limit,
      orderBy: { followerCount: 'desc' },
      select: {
        id: true, userId: true, type: true, displayName: true, bio: true, avatarUrl: true,
        city: true, nationality: true, travelInterests: true, isVerified: true,
        followerCount: true, postCount: true,
      },
    });
  }

  async discoverGroups(params: { limit?: number; search?: string } = {}) {
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 12)));
    const where: any = { visibility: 'PUBLIC' };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    return this.prisma.tripGroup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { _count: { select: { members: true, posts: true } } },
    });
  }

  async trendingPosts(limit = 10) {
    return this.prisma.post.findMany({
      where: { moderationStatus: 'APPROVED', deletedAt: null, visibility: 'PUBLIC' },
      orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: true },
    });
  }

  // Alias for controller
  updateAccount = this.updateMyAccount.bind(this);

  // ── Messaging ───────────────────────────────────────────────────────────
  /** List all conversations the current user participates in. */
  async listConversations(tenantId: string, userId: string) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    // participants JSON contains social-account ids
    const all = await this.prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });
    const mine = all.filter((c) => {
      const ps = Array.isArray(c.participants) ? (c.participants as string[]) : [];
      return ps.includes(account.id);
    });
    // Hydrate with the other participant's profile + latest message
    const result = await Promise.all(
      mine.map(async (c) => {
        const ps = (c.participants as string[]).filter((id) => id !== account.id);
        const others = ps.length
          ? await this.prisma.socialAccount.findMany({
              where: { id: { in: ps } },
              select: { id: true, displayName: true, avatarUrl: true, userId: true },
            })
          : [];
        const latest = await this.prisma.message.findFirst({
          where: { conversationId: c.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          lastMessageAt: c.lastMessageAt,
          other: others[0] ?? null,
          others,
          latest,
        };
      }),
    );
    return { items: result, total: result.length };
  }

  /** Start (or reuse) a DM thread between current user and recipient (by user id). */
  async openConversation(tenantId: string, userId: string, recipientUserId: string) {
    if (userId === recipientUserId) throw new BadRequestException('Cannot DM yourself');
    const me = await this.getOrCreateSocialAccount(userId, tenantId);
    let other = await this.prisma.socialAccount.findFirst({ where: { userId: recipientUserId } });
    if (!other) {
      other = await this.prisma.socialAccount.create({
        data: { userId: recipientUserId, type: 'OPERATOR' as any, displayName: 'User' },
      });
    }
    const pair = [me.id, other.id].sort();
    // Reuse if a DM with same pair exists
    const existing = await this.prisma.conversation.findMany({ where: { type: 'DM' }, take: 200 });
    const found = existing.find((c) => {
      const ps = Array.isArray(c.participants) ? (c.participants as string[]).slice().sort() : [];
      return ps.length === 2 && ps[0] === pair[0] && ps[1] === pair[1];
    });
    if (found) return found;
    return this.prisma.conversation.create({
      data: { type: 'DM', participants: pair as any },
    });
  }

  async listMessages(tenantId: string, userId: string, conversationId: string, params: { page?: number; limit?: number }) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const ps = Array.isArray(conv.participants) ? (conv.participants as string[]) : [];
    if (!ps.includes(account.id)) throw new BadRequestException('Not a participant');

    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 50)));
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
      }),
      this.prisma.message.count({ where: { conversationId, deletedAt: null } }),
    ]);
    return { items: items.reverse(), total, page, limit };
  }

  async sendMessage(tenantId: string, userId: string, conversationId: string, body: string) {
    if (!body?.trim()) throw new BadRequestException('Message body is required');
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const conv = await this.prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const ps = Array.isArray(conv.participants) ? (conv.participants as string[]) : [];
    if (!ps.includes(account.id)) throw new BadRequestException('Not a participant');

    const msg = await this.prisma.message.create({
      data: { conversationId, senderId: account.id, body: body.trim() },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

    // Notify the other participant(s)
    const otherAccountIds = ps.filter((id) => id !== account.id);
    if (otherAccountIds.length) {
      const others = await this.prisma.socialAccount.findMany({
        where: { id: { in: otherAccountIds } },
        select: { userId: true },
      });
      for (const o of others) {
        await this.notifications.fire({
          tenantId,
          recipientUserId: o.userId,
          actorUserId: userId,
          type: 'MESSAGE',
          title: 'New message',
          body: body.slice(0, 140),
          link: `/messages?c=${conversationId}`,
          data: { conversationId, messageId: msg.id },
        });
      }
    }
    return msg;
  }
}
