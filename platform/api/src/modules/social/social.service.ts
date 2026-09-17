import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireId } from '../../common/tenant-scope';
import { PUBLIC_GROUP_SELECT } from '../groups/group-public.select';

/** Public profile projection — never phone, nationality, travel dates or moderation flags. */
export const PUBLIC_AUTHOR_SELECT = { id: true, displayName: true, avatarUrl: true, isVerified: true } as const;

/** Moderation outcomes that remove content from everyone but its author. */
const HIDDEN_MODERATION = ['REJECTED', 'SHADOW_BANNED', 'HELD_FOR_REVIEW'] as const;
const HIDDEN_COMMENT_MODERATION = ['REJECTED', 'SHADOW_BANNED'] as const;

/** Who is looking: resolved once per request. */
interface Viewer {
  userId: string;
  accountId: string | null;
  isVerified: boolean;
  roles: string[];
}

/*
 * Post visibility rules (PostVisibility enum):
 *   PUBLIC        every signed-in user
 *   FOLLOWER_SET  the author's followers (follows need no approval)
 *   VERIFIED_ONLY viewers whose social account is verified
 *   ROLE_SET      viewers holding one of post.targetRoles
 *   CUSTOM_SET    author only (no audience list is modelled)
 * The author always sees their own posts. Soft-deleted posts are never shown, and
 * REJECTED / SHADOW_BANNED / HELD_FOR_REVIEW posts are shown only to the author.
 */

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getOrCreateSocialAccount(userId: string, _tenantId: string) {
    let account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (!account) {
      account = await this.prisma.socialAccount.create({
        data: { userId, type: 'OPERATOR' as any, displayName: 'User' },
      });
    }
    return account;
  }

  // ── Visibility ──────────────────────────────────────────────────────────────

  private async getViewer(userId: string, roles: string[] = []): Promise<Viewer> {
    const account = userId
      ? await this.prisma.socialAccount.findFirst({ where: { userId }, select: { id: true, isVerified: true } })
      : null;
    return { userId, accountId: account?.id ?? null, isVerified: !!account?.isVerified, roles: roles ?? [] };
  }

  private async followedAuthorIds(viewer: Viewer): Promise<string[]> {
    if (!viewer.accountId) return [];
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewer.accountId },
      select: { followedId: true },
    });
    return follows.map((f) => f.followedId);
  }

  /** Prisma filter for posts `viewer` may see (followed = accounts the viewer follows). */
  private visiblePostsWhere(viewer: Viewer, followed: string[], opts: { publicOnly?: boolean } = {}): Prisma.PostWhereInput {
    const notHidden: Prisma.PostWhereInput = { moderationStatus: { notIn: [...HIDDEN_MODERATION] } };
    const or: Prisma.PostWhereInput[] = [{ visibility: 'PUBLIC', ...notHidden }];
    if (!opts.publicOnly) {
      if (viewer.accountId) or.push({ authorId: viewer.accountId });
      if (followed.length) or.push({ visibility: 'FOLLOWER_SET', authorId: { in: followed }, ...notHidden });
      if (viewer.isVerified) or.push({ visibility: 'VERIFIED_ONLY', ...notHidden });
      if (viewer.roles.length) or.push({ visibility: 'ROLE_SET', targetRoles: { hasSome: viewer.roles }, ...notHidden });
    }
    return { deletedAt: null, OR: or };
  }

  /** Comments `viewer` may see. */
  private visibleCommentsWhere(viewer: Viewer): Prisma.CommentWhereInput {
    return {
      deletedAt: null,
      OR: [
        { moderationStatus: { notIn: [...HIDDEN_COMMENT_MODERATION] } },
        ...(viewer.accountId ? [{ authorId: viewer.accountId }] : []),
      ],
    };
  }

  /** Loads a post only if `viewer` may see it; otherwise the same 404 as an unknown id. */
  private async findVisiblePost(viewer: Viewer, postId: string) {
    const id = requireId(postId, 'Post');
    const followed = await this.followedAuthorIds(viewer);
    const post = await this.prisma.post.findFirst({
      where: { AND: [{ id }, this.visiblePostsWhere(viewer, followed)] },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  // ── Feed ────────────────────────────────────────────────────────────────────

  async getFeed(tenantId: string, userId: string, query: any, roles: string[] = []) {
    const page = Math.max(1, Number(query?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query?.limit ?? 20)));
    const { type, followingOnly } = query ?? {};
    const skip = (page - 1) * limit;

    const viewer = await this.getViewer(userId, roles);
    const account = viewer.accountId ? { id: viewer.accountId } : null;

    const and: Prisma.PostWhereInput[] = [];
    if (type) and.push({ type });

    if (followingOnly) {
      // Posts from followed accounts, still subject to every visibility rule.
      const followed = await this.followedAuthorIds(viewer);
      and.push({ authorId: { in: followed } });
      and.push(this.visiblePostsWhere(viewer, followed));
    } else {
      and.push(this.visiblePostsWhere(viewer, [], { publicOnly: true }));
    }
    const where: Prisma.PostWhereInput = { AND: and };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: +limit,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          author: { select: PUBLIC_AUTHOR_SELECT },
          comments: {
            where: { AND: [this.visibleCommentsWhere(viewer), { parentId: null }] },
            take: 2,
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
          // viewer's own reactions so the client can restore liked state after reload
          ...(account ? { reactions: { where: { accountId: account.id }, select: { type: true } } } : {}),
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items: posts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Posts ───────────────────────────────────────────────────────────────────

  async createPost(tenantId: string, userId: string, dto: any) {
    const text = String(dto.content ?? dto.body ?? '');
    if (!text.trim() && !(dto.mediaUrls?.length)) throw new BadRequestException('Post content is required');
    if (dto.visibility === 'ROLE_SET' && !(dto.targetRoles?.length)) {
      throw new BadRequestException('targetRoles is required for ROLE_SET visibility');
    }
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    return this.prisma.post.create({
      data: {
        authorId: account.id,
        type: dto.type ?? 'UPDATE',
        body: text,
        visibility: dto.visibility ?? 'PUBLIC',
        mediaUrls: dto.mediaUrls ?? [],
        tags: dto.tags ?? [],
        language: dto.language ?? 'ar',
        targetRoles: dto.targetRoles ?? [],
      },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
  }

  async findOnePost(userId: string, id: string, roles: string[] = []) {
    const viewer = await this.getViewer(userId, roles);
    const visible = await this.findVisiblePost(viewer, id);
    const post = await this.prisma.post.findFirst({
      where: { id: visible.id, deletedAt: null },
      include: {
        author: { select: PUBLIC_AUTHOR_SELECT },
        comments: {
          where: this.visibleCommentsWhere(viewer),
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

  async addComment(tenantId: string, userId: string, postId: string, dto: any, roles: string[] = []) {
    const text = String(dto.content ?? dto.body ?? '').trim();
    if (!text) throw new BadRequestException('Comment content is required');
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    const post = await this.findVisiblePost(await this.getViewer(userId, roles), postId);

    if (dto.parentId) {
      const parent = await this.prisma.comment.findFirst({
        where: { id: requireId(dto.parentId, 'Comment'), postId: post.id, deletedAt: null },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId: post.id,
        authorId: account.id,
        body: text,
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

  async toggleReaction(tenantId: string, userId: string, postId: string, dto: any, roles: string[] = []) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    const post = await this.findVisiblePost(await this.getViewer(userId, roles), postId);

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
    const withCounts = { _count: { select: { posts: true, followerList: true, followingList: true } } };
    let account = await this.prisma.socialAccount.findFirst({ where: { userId }, include: withCounts });
    if (!account) {
      await this.getOrCreateSocialAccount(userId, tenantId);
      account = await this.prisma.socialAccount.findFirst({ where: { userId }, include: withCounts });
    }
    if (!account) return null;
    // FIX-07: expose LIVE counts (not the stale denormalized columns) under the
    // names the UI reads (_count.posts / followers / following), so profile
    // counters update immediately after posting / following.
    const { _count, ...rest } = account as any;
    return {
      ...rest,
      _count: { posts: _count.posts, followers: _count.followerList, following: _count.followingList },
    };
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
  async toggleSavePost(tenantId: string, userId: string, postId: string, roles: string[] = []) {
    postId = requireId(postId, 'Post');
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const existing = await this.prisma.savedPost.findUnique({ where: { accountId_postId: { accountId: account.id, postId } } });
    if (existing) {
      await this.prisma.savedPost.delete({ where: { id: existing.id } });
      await this.prisma.post.update({ where: { id: postId }, data: { saveCount: { decrement: 1 } } }).catch(() => undefined);
      return { saved: false };
    }
    // Un-saving is always allowed; saving requires the post to exist and be visible.
    await this.findVisiblePost(await this.getViewer(userId, roles), postId);
    await this.prisma.savedPost.create({ data: { accountId: account.id, postId } });
    await this.prisma.post.update({ where: { id: postId }, data: { saveCount: { increment: 1 } } }).catch(() => undefined);
    return { saved: true };
  }

  async listSavedPosts(tenantId: string, userId: string, roles: string[] = []) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const viewer: Viewer = { userId, accountId: account.id, isVerified: !!account.isVerified, roles: roles ?? [] };
    const followed = await this.followedAuthorIds(viewer);
    const items = await this.prisma.savedPost.findMany({
      // hide saved posts that were since deleted, moderated away or restricted
      where: { accountId: account.id, post: this.visiblePostsWhere(viewer, followed) },
      orderBy: { savedAt: 'desc' },
      include: { post: { include: { author: { select: PUBLIC_AUTHOR_SELECT } } } },
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
    const people = await this.prisma.socialAccount.findMany({
      where,
      take: limit,
      orderBy: { followerCount: 'desc' },
      select: {
        id: true, userId: true, type: true, displayName: true, bio: true, avatarUrl: true,
        city: true, nationality: true, travelInterests: true, isVerified: true,
        followerCount: true, postCount: true,
      },
    });
    const follows = await this.prisma.follow.findMany({
      where: { followerId: me.id, followedId: { in: people.map((p) => p.id) } },
      select: { followedId: true },
    });
    const followedIds = new Set(follows.map((f) => f.followedId));
    return people.map((p) => ({ ...p, isFollowing: followedIds.has(p.id) }));
  }

  async discoverGroups(params: { limit?: number; search?: string } = {}) {
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 12)));
    const where: any = { visibility: 'PUBLIC' };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    return this.prisma.tripGroup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PUBLIC_GROUP_SELECT,
    });
  }

  async trendingPosts(limit = 10) {
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    return this.prisma.post.findMany({
      where: { moderationStatus: 'APPROVED', deletedAt: null, visibility: 'PUBLIC' },
      orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }, { createdAt: 'desc' }],
      take,
      include: { author: { select: PUBLIC_AUTHOR_SELECT } },
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
    recipientUserId = requireId(recipientUserId, 'Recipient');
    if (userId === recipientUserId) throw new BadRequestException('Cannot DM yourself');
    // The recipient must be an existing, usable account.
    const recipient = await this.prisma.user.findFirst({
      where: { id: recipientUserId, deletedAt: null, status: { notIn: ['INACTIVE', 'LOCKED'] } },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    const me = await this.getOrCreateSocialAccount(userId, tenantId);
    let other = await this.prisma.socialAccount.findFirst({ where: { userId: recipient.id } });
    if (other?.isSuspended) throw new NotFoundException('Recipient not found');
    if (!other) {
      other = await this.prisma.socialAccount.create({
        data: { userId: recipient.id, type: 'OPERATOR' as any, displayName: 'User' },
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
    // Same answer as an unknown id: non-participants learn nothing about the conversation.
    if (!ps.includes(account.id)) throw new NotFoundException('Conversation not found');

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
    // Same answer as an unknown id: non-participants learn nothing about the conversation.
    if (!ps.includes(account.id)) throw new NotFoundException('Conversation not found');

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
