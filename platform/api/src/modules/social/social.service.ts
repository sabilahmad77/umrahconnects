import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SocialAccountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireId } from '../../common/tenant-scope';
import { PUBLIC_GROUP_SELECT } from '../groups/group-public.select';
import { COMMUNITY_TENANT_SLUG } from '../rbac/catalog';

/** Public profile projection — never phone, nationality, travel dates or moderation flags. */
export const PUBLIC_AUTHOR_SELECT = { id: true, displayName: true, avatarUrl: true, isVerified: true } as const;

/** Moderation outcomes that remove content from everyone but its author. */
const HIDDEN_MODERATION = ['REJECTED', 'SHADOW_BANNED', 'HELD_FOR_REVIEW'] as const;
const HIDDEN_COMMENT_MODERATION = ['REJECTED', 'SHADOW_BANNED'] as const;

/** Accounts auto-created before names were derived from the user profile carry this placeholder. */
const LEGACY_PLACEHOLDER_NAME = 'User';

const ACCOUNT_TYPE_BY_TENANT_TYPE: Record<string, SocialAccountType> = {
  OPERATOR: 'OPERATOR',
  MU_ASSASA: 'OPERATOR',
  SUB_AGENT: 'SUB_AGENT',
  VENDOR_HOTEL: 'VENDOR_HOTEL',
  VENDOR_TRANSPORT: 'VENDOR_TRANSPORT',
  VENDOR_CATERING: 'VENDOR_CATERING',
  VENDOR_GUIDE: 'MUTAWIF',
  VENDOR_VISA: 'VISA_PROCESSOR',
};

/** Who is looking: resolved once per request. */
interface Viewer {
  userId: string;
  accountId: string | null;
  isVerified: boolean;
  roles: string[];
}

interface Page {
  page?: number;
  limit?: number;
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
 *
 * Comments: one reply level. A reply to a reply is attached to the top-level
 * comment it belongs to. Only a comment's author may edit or delete it; deleting a
 * top-level comment removes its replies too. Counts returned to clients are
 * computed from live rows, never from the denormalised counters (which seeded or
 * legacy data may have inflated); the counters are still maintained for sorting.
 */

const normalizeTag = (tag: string) => tag.trim().replace(/^#+/, '').toLowerCase();
const normalizeTags = (tags?: string[]) => [...new Set((tags ?? []).map(normalizeTag).filter(Boolean))].slice(0, 20);
const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ── Accounts ──────────────────────────────────────────────────────────────────

  /** The user's social account, created on first use with a name taken from their user profile. */
  private async getOrCreateSocialAccount(userId: string, _tenantId?: string) {
    const existing = await this.prisma.socialAccount.findFirst({ where: { userId } });
    if (existing && existing.displayName !== LEGACY_PLACEHOLDER_NAME) return existing;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, tenant: { select: { type: true, slug: true } } },
    });
    const fullName = [user?.firstName, user?.lastName].map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
    const displayName = (fullName || user?.email?.split('@')[0] || '').slice(0, 100);
    const type: SocialAccountType =
      user?.tenant?.slug === COMMUNITY_TENANT_SLUG
        ? 'PILGRIM'
        : ACCOUNT_TYPE_BY_TENANT_TYPE[user?.tenant?.type ?? ''] ?? 'OPERATOR';

    if (existing) {
      // One-off repair of accounts auto-created with the placeholder name (and the
      // wrong type): posts by every traveler used to show "User".
      if (!displayName) return existing;
      return this.prisma.socialAccount.update({ where: { id: existing.id }, data: { displayName, type } });
    }
    try {
      return await this.prisma.socialAccount.create({ data: { userId, type, displayName: displayName || 'Member' } });
    } catch (e) {
      // Two first requests raced: the other one created it.
      if (isUniqueViolation(e)) return this.prisma.socialAccount.findFirstOrThrow({ where: { userId } });
      throw e;
    }
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

  /** A comment on `postId` that `viewer` may see; otherwise 404. */
  private async findVisibleComment(viewer: Viewer, postId: string, commentId: string) {
    const id = requireId(commentId, 'Comment');
    const comment = await this.prisma.comment.findFirst({
      where: { AND: [{ id, postId }, this.visibleCommentsWhere(viewer)] },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    return comment;
  }

  // ── Presentation ────────────────────────────────────────────────────────────

  /** What a post read includes: the author, live comment/save counts and the viewer's own state. */
  private postInclude(viewer: Viewer) {
    return {
      author: { select: PUBLIC_AUTHOR_SELECT },
      _count: { select: { comments: { where: this.visibleCommentsWhere(viewer) }, savedBy: true } },
      ...(viewer.accountId
        ? {
            reactions: { where: { accountId: viewer.accountId }, select: { type: true } },
            savedBy: { where: { accountId: viewer.accountId }, select: { id: true } },
          }
        : {}),
    } satisfies Prisma.PostInclude;
  }

  /**
   * Shapes posts for clients. Like/share counts come from one grouped query over
   * the page; moderation internals are never exposed, and the author alone sees
   * the moderation status and role audience of their own post.
   */
  private async presentPosts(posts: any[], viewer: Viewer) {
    if (!posts.length) return [];
    const grouped = await this.prisma.reaction.groupBy({
      by: ['postId', 'type'],
      where: { postId: { in: posts.map((p) => p.id) }, type: { in: ['LIKE', 'SHARE'] } },
      _count: { _all: true },
    });
    const reactionCount = (postId: string, type: string) =>
      grouped.find((g) => g.postId === postId && g.type === type)?._count._all ?? 0;

    return posts.map((p) => {
      const isMine = !!viewer.accountId && p.authorId === viewer.accountId;
      const own: { type: string }[] = p.reactions ?? [];
      return {
        id: p.id,
        authorId: p.authorId,
        author: p.author,
        type: p.type,
        visibility: p.visibility,
        body: p.body,
        structuredData: p.structuredData,
        mediaUrls: p.mediaUrls ?? [],
        attachmentUrl: p.attachmentUrl,
        tags: p.tags ?? [],
        language: p.language,
        expiresAt: p.expiresAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        editedAt: p.editedAt ?? null,
        likeCount: reactionCount(p.id, 'LIKE'),
        shareCount: reactionCount(p.id, 'SHARE'),
        commentCount: p._count?.comments ?? 0,
        saveCount: p._count?.savedBy ?? 0,
        likedByMe: own.some((r) => r.type === 'LIKE'),
        savedByMe: (p.savedBy?.length ?? 0) > 0,
        isMine,
        ...(isMine ? { moderationStatus: p.moderationStatus, targetRoles: p.targetRoles ?? [] } : {}),
        // Viewer-only arrays kept for existing clients (mobile) that read them.
        reactions: own,
        savedBy: p.savedBy ?? [],
      };
    });
  }

  private async presentPost(postId: string, viewer: Viewer) {
    const post = await this.prisma.post.findFirst({ where: { id: postId }, include: this.postInclude(viewer) });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    return (await this.presentPosts([post], viewer))[0];
  }

  private presentComment(c: any, viewer: Viewer, replyCount?: number) {
    const isMine = !!viewer.accountId && c.authorId === viewer.accountId;
    return {
      id: c.id,
      postId: c.postId,
      parentId: c.parentId ?? null,
      body: c.body,
      author: c.author,
      createdAt: c.createdAt,
      editedAt: c.editedAt ?? null,
      isMine,
      // The server's rule, surfaced so clients never offer what would be refused.
      canEdit: isMine,
      canDelete: isMine,
      ...(replyCount !== undefined ? { replyCount } : {}),
      ...(isMine ? { moderationStatus: c.moderationStatus } : {}),
    };
  }

  // ── Media ─────────────────────────────────────────────────────────────────────

  /**
   * Post images must be public media this platform stored (POST /uploads):
   * `/uploads/<file>` locally or `<S3_PUBLIC_BASE_URL>/media/<file>` on R2.
   * Arbitrary URLs would turn posts into tracking pixels or hot-links.
   */
  private ownMedia(urls: string[] | undefined): string[] {
    if (!urls?.length) return [];
    const base = this.config.get<string>('S3_PUBLIC_BASE_URL')?.replace(/\/+$/, '');
    const fileName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
    const isOwn = (u: string) =>
      (u.startsWith('/uploads/') && fileName.test(u.slice('/uploads/'.length))) ||
      (!!base && u.startsWith(`${base}/media/`) && fileName.test(u.slice(`${base}/media/`.length)));
    for (const u of urls) {
      if (typeof u !== 'string' || !isOwn(u)) throw new BadRequestException('Post images must be uploaded through Umrah Connect');
    }
    return [...new Set(urls)];
  }

  // ── Notifications (best-effort: a failed notification never fails the action) ─

  private async notify(input: Parameters<NotificationsService['fire']>[0]) {
    try {
      await this.notifications.fire(input);
    } catch (e) {
      this.logger.warn(`notification ${input.type} failed: ${(e as Error).message}`);
    }
  }

  private async accountUserId(accountId: string) {
    return (await this.prisma.socialAccount.findUnique({ where: { id: accountId }, select: { userId: true } }))?.userId;
  }

  // ── Feed ────────────────────────────────────────────────────────────────────

  async getFeed(tenantId: string, userId: string, query: any, roles: string[] = []) {
    const page = Math.max(1, Number(query?.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query?.limit ?? 20)));
    const { type, followingOnly } = query ?? {};
    const tag = typeof query?.tag === 'string' ? normalizeTag(query.tag) : '';

    const viewer = await this.getViewer(userId, roles);
    const followed = await this.followedAuthorIds(viewer);

    // Every post the viewer may see: public posts, their own, followers-only posts of
    // accounts they follow, verified-only and role-targeted posts they qualify for.
    const and: Prisma.PostWhereInput[] = [this.visiblePostsWhere(viewer, followed)];
    if (type) and.push({ type });
    if (tag) and.push({ tags: { has: tag } });
    if (followingOnly) and.push({ authorId: { in: followed } });
    const where: Prisma.PostWhereInput = { AND: and };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: this.postInclude(viewer),
      }),
      this.prisma.post.count({ where }),
    ]);

    return { items: await this.presentPosts(posts, viewer), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Posts ───────────────────────────────────────────────────────────────────

  async createPost(tenantId: string, userId: string, dto: any, roles: string[] = []) {
    const text = String(dto.content ?? dto.body ?? '').trim();
    const mediaUrls = this.ownMedia(dto.mediaUrls);
    if (!text && !mediaUrls.length) throw new BadRequestException('Post content is required');
    if (dto.visibility === 'ROLE_SET' && !dto.targetRoles?.length) {
      throw new BadRequestException('targetRoles is required for ROLE_SET visibility');
    }
    const account = await this.getOrCreateSocialAccount(userId, tenantId);

    const post = await this.prisma.post.create({
      data: {
        authorId: account.id,
        type: dto.type ?? 'UPDATE',
        body: text,
        visibility: dto.visibility ?? 'PUBLIC',
        mediaUrls,
        tags: normalizeTags(dto.tags),
        language: dto.language ?? 'ar',
        targetRoles: dto.visibility === 'ROLE_SET' ? dto.targetRoles : [],
      },
    });
    await this.prisma.socialAccount.update({ where: { id: account.id }, data: { postCount: { increment: 1 } } });
    const viewer: Viewer = { userId, accountId: account.id, isVerified: account.isVerified, roles };
    return this.presentPost(post.id, viewer);
  }

  /** Single post with its visible comments inline (flat, oldest first — the mobile client reads them). */
  async findOnePost(userId: string, id: string, roles: string[] = []) {
    const viewer = await this.getViewer(userId, roles);
    const visible = await this.findVisiblePost(viewer, id);
    const [post, comments] = await Promise.all([
      this.presentPost(visible.id, viewer),
      this.prisma.comment.findMany({
        where: { AND: [{ postId: visible.id }, this.visibleCommentsWhere(viewer)] },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: { author: { select: PUBLIC_AUTHOR_SELECT } },
      }),
    ]);
    return { ...post, comments: comments.map((c) => this.presentComment(c, viewer)) };
  }

  // Alias for controller
  getPost = this.findOnePost.bind(this);

  /** The author's own, live post; anything else is the same 404 as an unknown id. */
  private async ownPost(userId: string, id: string) {
    const postId = requireId(id, 'Post');
    const account = await this.prisma.socialAccount.findFirst({ where: { userId } });
    const post = account
      ? await this.prisma.post.findFirst({ where: { id: postId, authorId: account.id, deletedAt: null } })
      : null;
    if (!account || !post) throw new NotFoundException(`Post ${postId} not found`);
    return { account, post };
  }

  async updatePost(tenantId: string, userId: string, id: string, dto: any, roles: string[] = []) {
    const { account, post } = await this.ownPost(userId, id);

    const data: Prisma.PostUpdateInput = {};
    if (dto.body !== undefined || dto.content !== undefined) {
      const text = String(dto.content ?? dto.body ?? '').trim();
      if (!text && !post.mediaUrls.length) throw new BadRequestException('Post content is required');
      if (text !== (post.body ?? '')) {
        data.body = text;
        data.editedAt = new Date();
      }
    }
    if (dto.tags !== undefined) data.tags = normalizeTags(dto.tags);
    if (dto.visibility !== undefined) data.visibility = dto.visibility;
    const visibility = dto.visibility ?? post.visibility;
    if (visibility === 'ROLE_SET') {
      const targetRoles = dto.targetRoles ?? post.targetRoles;
      if (!targetRoles?.length) throw new BadRequestException('targetRoles is required for ROLE_SET visibility');
      data.targetRoles = targetRoles;
    } else if (dto.visibility !== undefined) {
      data.targetRoles = [];
    }

    if (Object.keys(data).length) await this.prisma.post.update({ where: { id: post.id }, data });
    const viewer: Viewer = { userId, accountId: account.id, isVerified: account.isVerified, roles };
    return this.presentPost(post.id, viewer);
  }

  async deletePost(tenantId: string, userId: string, id: string) {
    const { account, post } = await this.ownPost(userId, id);
    await this.prisma.post.update({ where: { id: post.id }, data: { deletedAt: new Date() } });
    await this.prisma.socialAccount.updateMany({
      where: { id: account.id, postCount: { gt: 0 } },
      data: { postCount: { decrement: 1 } },
    });
    return { id: post.id, deleted: true };
  }

  // ── Comments ─────────────────────────────────────────────────────────────────

  /**
   * Top-level comments (newest first) or, with `parentId`, the replies to one
   * comment (oldest first, reading as a conversation). Both are paginated.
   */
  async listComments(userId: string, postId: string, query: { parentId?: string } & Page, roles: string[] = []) {
    const viewer = await this.getViewer(userId, roles);
    const post = await this.findVisiblePost(viewer, postId);
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 10)));
    const parent = query.parentId ? await this.findVisibleComment(viewer, post.id, query.parentId) : null;

    const where: Prisma.CommentWhereInput = {
      AND: [{ postId: post.id, parentId: parent?.id ?? null }, this.visibleCommentsWhere(viewer)],
    };
    const [rows, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: parent ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { author: { select: PUBLIC_AUTHOR_SELECT } },
      }),
      this.prisma.comment.count({ where }),
    ]);

    let replyCounts = new Map<string, number>();
    if (!parent && rows.length) {
      const grouped = await this.prisma.comment.groupBy({
        by: ['parentId'],
        where: { AND: [{ postId: post.id, parentId: { in: rows.map((r) => r.id) } }, this.visibleCommentsWhere(viewer)] },
        _count: { _all: true },
      });
      replyCounts = new Map(grouped.map((g) => [g.parentId as string, g._count._all]));
    }

    return {
      items: rows.map((c) => this.presentComment(c, viewer, parent ? undefined : replyCounts.get(c.id) ?? 0)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async addComment(tenantId: string, userId: string, postId: string, dto: any, roles: string[] = []) {
    const text = String(dto.content ?? dto.body ?? '').trim();
    if (!text) throw new BadRequestException('Comment content is required');
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const viewer: Viewer = { userId, accountId: account.id, isVerified: account.isVerified, roles };
    const post = await this.findVisiblePost(viewer, postId);

    // One reply level: replying to a reply attaches to that reply's top-level comment.
    let parent: { id: string; parentId: string | null; authorId: string } | null = null;
    if (dto.parentId) {
      const target = await this.findVisibleComment(viewer, post.id, dto.parentId);
      parent = target.parentId ? await this.findVisibleComment(viewer, post.id, target.parentId) : target;
    }

    const comment = await this.prisma.comment.create({
      data: { postId: post.id, authorId: account.id, body: text, parentId: parent?.id ?? null },
      include: { author: { select: PUBLIC_AUTHOR_SELECT } },
    });
    await this.prisma.post.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });

    const excerpt = text.slice(0, 140);
    const link = `/social?post=${post.id}`;
    const data = { postId: post.id, commentId: comment.id, ...(parent ? { parentId: parent.id } : {}) };
    const postAuthorUserId = await this.accountUserId(post.authorId);
    const parentAuthorUserId = parent ? await this.accountUserId(parent.authorId) : undefined;
    if (parentAuthorUserId) {
      await this.notify({
        tenantId, recipientUserId: parentAuthorUserId, actorUserId: userId, type: 'COMMENT_REPLY',
        title: `${account.displayName} replied to your comment`, body: excerpt, link, data,
      });
    }
    if (postAuthorUserId && postAuthorUserId !== parentAuthorUserId) {
      await this.notify({
        tenantId, recipientUserId: postAuthorUserId, actorUserId: userId, type: 'POST_COMMENT',
        title: `${account.displayName} commented on your post`, body: excerpt, link, data,
      });
    }

    return this.presentComment(comment, viewer, parent ? undefined : 0);
  }

  /** Only the author edits a comment; everyone else gets the 404 of an unknown id. */
  async updateComment(tenantId: string, userId: string, postId: string, commentId: string, dto: any, roles: string[] = []) {
    const text = String(dto?.content ?? dto?.body ?? '').trim();
    if (!text) throw new BadRequestException('Comment content is required');
    const viewer = await this.getViewer(userId, roles);
    const post = await this.findVisiblePost(viewer, postId);
    const comment = viewer.accountId
      ? await this.prisma.comment.findFirst({
          where: { id: requireId(commentId, 'Comment'), postId: post.id, authorId: viewer.accountId, deletedAt: null },
        })
      : null;
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const updated = await this.prisma.comment.update({
      where: { id: comment.id },
      data: text === comment.body ? {} : { body: text, editedAt: new Date() },
      include: { author: { select: PUBLIC_AUTHOR_SELECT } },
    });
    return this.presentComment(updated, viewer);
  }

  /** Only the author deletes a comment; a top-level comment takes its replies with it. */
  async deleteComment(tenantId: string, userId: string, postId: string, commentId: string, roles: string[] = []) {
    const viewer = await this.getViewer(userId, roles);
    const post = await this.findVisiblePost(viewer, postId);
    const comment = viewer.accountId
      ? await this.prisma.comment.findFirst({
          where: { id: requireId(commentId, 'Comment'), postId: post.id, authorId: viewer.accountId, deletedAt: null },
          select: { id: true, parentId: true },
        })
      : null;
    if (!comment) throw new NotFoundException(`Comment ${commentId} not found`);

    const now = new Date();
    const removed = await this.prisma.$transaction(async (tx) => {
      const self = await tx.comment.updateMany({ where: { id: comment.id, deletedAt: null }, data: { deletedAt: now } });
      const replies = comment.parentId
        ? { count: 0 }
        : await tx.comment.updateMany({ where: { parentId: comment.id, deletedAt: null }, data: { deletedAt: now } });
      const count = self.count + replies.count;
      if (count) {
        await tx.post.updateMany({ where: { id: post.id, commentCount: { gte: count } }, data: { commentCount: { decrement: count } } });
      }
      return count;
    });
    return { id: comment.id, deleted: true, removed };
  }

  // ── Reactions ─────────────────────────────────────────────────────────────────

  async toggleReaction(tenantId: string, userId: string, postId: string, dto: any, roles: string[] = []) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const viewer: Viewer = { userId, accountId: account.id, isVerified: account.isVerified, roles };
    const post = await this.findVisiblePost(viewer, postId);

    // Accept dto as object, string, or undefined; also accept `reaction` alias for `type`
    const reactionType: string = (typeof dto === 'string' ? dto : (dto?.type ?? dto?.reaction)) ?? 'LIKE';
    const counter = reactionType === 'LIKE' ? 'likeCount' : reactionType === 'SHARE' ? 'shareCount' : null;
    const existing = await this.prisma.reaction.findFirst({ where: { postId: post.id, accountId: account.id, type: reactionType } });

    let toggled: boolean;
    if (existing) {
      const removed = await this.prisma.reaction.deleteMany({ where: { id: existing.id } });
      if (removed.count && counter) {
        await this.prisma.post.updateMany({ where: { id: post.id, [counter]: { gt: 0 } }, data: { [counter]: { decrement: 1 } } });
      }
      toggled = false;
    } else {
      try {
        await this.prisma.reaction.create({ data: { postId: post.id, accountId: account.id, type: reactionType } });
        if (counter) await this.prisma.post.update({ where: { id: post.id }, data: { [counter]: { increment: 1 } } });
      } catch (e) {
        // A double click raced this request: the reaction exists, which is the requested state.
        if (!isUniqueViolation(e)) throw e;
      }
      toggled = true;

      if (reactionType === 'LIKE' || reactionType === 'SHARE') {
        const recipientUserId = await this.accountUserId(post.authorId);
        // Like/unlike/like must not stack notifications: one unread one per actor and post.
        const pending = recipientUserId
          ? await this.prisma.notification.findFirst({
              where: { recipientId: recipientUserId, actorId: userId, type: 'POST_REACTION', readAt: null, data: { path: ['postId'], equals: post.id } },
              select: { id: true },
            })
          : null;
        if (recipientUserId && !pending) {
          await this.notify({
            tenantId, recipientUserId, actorUserId: userId, type: 'POST_REACTION',
            title: reactionType === 'LIKE' ? `${account.displayName} liked your post` : `${account.displayName} shared your post`,
            link: `/social?post=${post.id}`,
            data: { postId: post.id, type: reactionType },
          });
        }
      }
    }

    const likeCount = await this.prisma.reaction.count({ where: { postId: post.id, type: 'LIKE' } });
    const likedByMe =
      reactionType === 'LIKE'
        ? toggled
        : !!(await this.prisma.reaction.findFirst({ where: { postId: post.id, accountId: account.id, type: 'LIKE' }, select: { id: true } }));
    return { toggled, type: reactionType, likeCount, likedByMe };
  }

  async getReactions(tenantId: string, postId: string) {
    const post = await this.prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    return this.prisma.reaction.findMany({ where: { postId }, orderBy: { createdAt: 'desc' } });
  }

  // ── Follow ────────────────────────────────────────────────────────────────────

  async toggleFollow(tenantId: string, userId: string, targetAccountId: string) {
    const followerAccount = await this.getOrCreateSocialAccount(userId, tenantId);
    const targetId = requireId(targetAccountId, 'Account');
    if (followerAccount.id === targetId) throw new BadRequestException('Cannot follow yourself');
    const target = await this.prisma.socialAccount.findFirst({ where: { id: targetId, isSuspended: false } });
    if (!target) throw new NotFoundException(`Account ${targetId} not found`);

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followedId: { followerId: followerAccount.id, followedId: target.id } },
    });
    let following: boolean;
    if (existing) {
      const removed = await this.prisma.follow.deleteMany({ where: { followerId: followerAccount.id, followedId: target.id } });
      if (removed.count) {
        await this.prisma.socialAccount.updateMany({ where: { id: followerAccount.id, followingCount: { gt: 0 } }, data: { followingCount: { decrement: 1 } } });
        await this.prisma.socialAccount.updateMany({ where: { id: target.id, followerCount: { gt: 0 } }, data: { followerCount: { decrement: 1 } } });
      }
      following = false;
    } else {
      try {
        await this.prisma.follow.create({ data: { followerId: followerAccount.id, followedId: target.id } });
        await this.prisma.socialAccount.update({ where: { id: followerAccount.id }, data: { followingCount: { increment: 1 } } });
        await this.prisma.socialAccount.update({ where: { id: target.id }, data: { followerCount: { increment: 1 } } });
        await this.notify({
          tenantId, recipientUserId: target.userId, actorUserId: userId, type: 'FOLLOW',
          title: `${followerAccount.displayName} started following you`, link: '/social', data: { followerAccountId: followerAccount.id },
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      following = true;
    }
    const followerCount = await this.prisma.follow.count({ where: { followedId: target.id } });
    return { following, followerCount };
  }

  // ── Accounts ──────────────────────────────────────────────────────────────────

  async getAccount(id: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async getMyAccount(tenantId: string, userId: string) {
    await this.getOrCreateSocialAccount(userId, tenantId);
    const account = await this.prisma.socialAccount.findFirst({
      where: { userId },
      include: { _count: { select: { posts: { where: { deletedAt: null } }, followerList: true, followingList: true } } },
    });
    if (!account) return null;
    // Live counts (never the denormalised columns) under the names the UI reads.
    const { _count, ...rest } = account;
    return { ...rest, _count: { posts: _count.posts, followers: _count.followerList, following: _count.followingList } };
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

  // Alias for controller
  updateAccount = this.updateMyAccount.bind(this);

  // ── Saved posts (bookmarks) ─────────────────────────────────────────
  async toggleSavePost(tenantId: string, userId: string, postId: string, roles: string[] = []) {
    postId = requireId(postId, 'Post');
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const existing = await this.prisma.savedPost.findUnique({ where: { accountId_postId: { accountId: account.id, postId } } });
    let saved: boolean;
    if (existing) {
      // Un-saving is always allowed, even for a post that has since become invisible.
      const removed = await this.prisma.savedPost.deleteMany({ where: { id: existing.id } });
      if (removed.count) {
        await this.prisma.post.updateMany({ where: { id: postId, saveCount: { gt: 0 } }, data: { saveCount: { decrement: 1 } } });
      }
      saved = false;
    } else {
      // Saving requires the post to exist and be visible.
      await this.findVisiblePost({ userId, accountId: account.id, isVerified: account.isVerified, roles }, postId);
      try {
        await this.prisma.savedPost.create({ data: { accountId: account.id, postId } });
        await this.prisma.post.update({ where: { id: postId }, data: { saveCount: { increment: 1 } } });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
      saved = true;
    }
    return { saved, saveCount: await this.prisma.savedPost.count({ where: { postId } }) };
  }

  async listSavedPosts(tenantId: string, userId: string, roles: string[] = []) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    const viewer: Viewer = { userId, accountId: account.id, isVerified: !!account.isVerified, roles: roles ?? [] };
    const followed = await this.followedAuthorIds(viewer);
    const items = await this.prisma.savedPost.findMany({
      // hide saved posts that were since deleted, moderated away or restricted
      where: { accountId: account.id, post: this.visiblePostsWhere(viewer, followed) },
      orderBy: { savedAt: 'desc' },
      take: 200,
      include: { post: { include: this.postInclude(viewer) } },
    });
    const posts = await this.presentPosts(items.map((s) => s.post), viewer);
    return posts.map((p, i) => ({ ...p, savedAt: items[i].savedAt }));
  }

  // ── Discover ─────────────────────────────────────────────────────────
  async discoverPeople(tenantId: string, userId: string, params: { limit?: number; search?: string } = {}) {
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 12)));
    const me = await this.getOrCreateSocialAccount(userId, tenantId);
    const where: Prisma.SocialAccountWhereInput = {
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
      orderBy: [{ followerCount: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true, userId: true, type: true, displayName: true, bio: true, avatarUrl: true,
        city: true, nationality: true, travelInterests: true, isVerified: true,
        followerCount: true, postCount: true,
      },
    });
    const ids = people.map((p) => p.id);
    const userIds = people.map((p) => p.userId);
    const [follows, followerCounts, connections] = await Promise.all([
      this.prisma.follow.findMany({ where: { followerId: me.id, followedId: { in: ids } }, select: { followedId: true } }),
      this.prisma.follow.groupBy({ by: ['followedId'], where: { followedId: { in: ids } }, _count: { _all: true } }),
      this.prisma.connection.findMany({
        where: {
          OR: [
            { requesterId: userId, recipientId: { in: userIds } },
            { recipientId: userId, requesterId: { in: userIds } },
          ],
        },
        select: { id: true, requesterId: true, recipientId: true, status: true },
      }),
    ]);
    const followedIds = new Set(follows.map((f) => f.followedId));
    return people.map((p) => {
      const c = connections.find((x) => x.requesterId === p.userId || x.recipientId === p.userId);
      return {
        ...p,
        // live follower count (the column may be stale)
        followerCount: followerCounts.find((g) => g.followedId === p.id)?._count._all ?? 0,
        isFollowing: followedIds.has(p.id),
        // A block is reported as "no connection possible" without saying who blocked whom.
        connection: c
          ? c.status === 'BLOCKED'
            ? { status: 'UNAVAILABLE' }
            : { status: c.status, direction: c.requesterId === userId ? 'OUTGOING' : 'INCOMING', connectionId: c.id }
          : { status: 'NONE' },
      };
    });
  }

  async discoverGroups(params: { limit?: number; search?: string } = {}) {
    const limit = Math.min(50, Math.max(1, Number(params.limit ?? 12)));
    const where: Prisma.TripGroupWhereInput = { visibility: 'PUBLIC' };
    if (params.search) where.name = { contains: params.search, mode: 'insensitive' };
    return this.prisma.tripGroup.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: PUBLIC_GROUP_SELECT,
    });
  }

  /** Public posts with the most live engagement (reactions, then comments). */
  async trendingPosts(limit = 10, userId?: string, roles: string[] = []) {
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const viewer = await this.getViewer(userId ?? '', roles);
    const posts = await this.prisma.post.findMany({
      where: this.visiblePostsWhere(viewer, [], { publicOnly: true }),
      orderBy: [{ reactions: { _count: 'desc' } }, { comments: { _count: 'desc' } }, { createdAt: 'desc' }],
      take,
      include: this.postInclude(viewer),
    });
    return this.presentPosts(posts, viewer);
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /** True when either user has blocked the other (a BLOCKED connection in either direction). */
  private async blockedBetween(userId: string, otherUserIds: string[]) {
    if (!otherUserIds.length) return false;
    const block = await this.prisma.connection.findFirst({
      where: {
        status: 'BLOCKED',
        OR: [
          { requesterId: userId, recipientId: { in: otherUserIds } },
          { recipientId: userId, requesterId: { in: otherUserIds } },
        ],
      },
      select: { id: true },
    });
    return !!block;
  }

  /** Conversations the current user participates in, most recent activity first. */
  async listConversations(tenantId: string, userId: string) {
    const account = await this.getOrCreateSocialAccount(userId, tenantId);
    // participants is a JSON array of social-account ids; containment is evaluated in
    // the database, so no conversation is missed however many others exist.
    const mine = await this.prisma.conversation.findMany({
      where: { participants: { array_contains: [account.id] } },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 100,
    });
    const otherIds = [...new Set(mine.flatMap((c) => (c.participants as string[]).filter((id) => id !== account.id)))];
    const others = otherIds.length
      ? await this.prisma.socialAccount.findMany({
          where: { id: { in: otherIds } },
          select: { id: true, displayName: true, avatarUrl: true, userId: true },
        })
      : [];
    const items = await Promise.all(
      mine.map(async (c) => {
        const ps = (c.participants as string[]).filter((id) => id !== account.id);
        const latest = await this.prisma.message.findFirst({
          where: { conversationId: c.id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true, body: true, createdAt: true, senderId: true },
        });
        const members = others.filter((o) => ps.includes(o.id));
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          lastMessageAt: c.lastMessageAt,
          createdAt: c.createdAt,
          other: members[0] ?? null,
          others: members,
          latest: latest ? { ...latest, isMine: latest.senderId === account.id } : null,
        };
      }),
    );
    return { items, total: items.length };
  }

  /** Start (or reuse) a DM thread between current user and recipient (by user id). */
  async openConversation(tenantId: string, userId: string, recipientUserId: string) {
    recipientUserId = requireId(recipientUserId, 'Recipient');
    if (userId === recipientUserId) throw new BadRequestException('Cannot DM yourself');
    // The recipient must be an existing, usable account with no block between the two users.
    const recipient = await this.prisma.user.findFirst({
      where: { id: recipientUserId, deletedAt: null, status: { notIn: ['INACTIVE', 'LOCKED'] } },
      select: { id: true },
    });
    if (!recipient || (await this.blockedBetween(userId, [recipient.id]))) throw new NotFoundException('Recipient not found');
    const me = await this.getOrCreateSocialAccount(userId, tenantId);
    const other = await this.getOrCreateSocialAccount(recipient.id);
    if (other.isSuspended) throw new NotFoundException('Recipient not found');

    const pair = [me.id, other.id].sort();
    const candidates = await this.prisma.conversation.findMany({
      where: { type: 'DM', participants: { array_contains: pair } },
      orderBy: { createdAt: 'asc' },
    });
    const found = candidates.find((c) => Array.isArray(c.participants) && (c.participants as string[]).length === 2);
    const conversation = found ?? (await this.prisma.conversation.create({ data: { type: 'DM', participants: pair } }));
    return {
      ...conversation,
      other: { id: other.id, displayName: other.displayName, avatarUrl: other.avatarUrl, userId: other.userId },
    };
  }

  /** A conversation the caller takes part in; non-participants get the 404 of an unknown id. */
  private async participantConversation(userId: string, conversationId: string) {
    const account = await this.getOrCreateSocialAccount(userId);
    const conv = await this.prisma.conversation.findUnique({ where: { id: requireId(conversationId, 'Conversation') } });
    const ps = conv && Array.isArray(conv.participants) ? (conv.participants as string[]) : [];
    if (!conv || !ps.includes(account.id)) throw new NotFoundException('Conversation not found');
    return { account, conv, participants: ps };
  }

  async listMessages(tenantId: string, userId: string, conversationId: string, params: Page) {
    const { account, conv } = await this.participantConversation(userId, conversationId);
    const page = Math.max(1, Number(params.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit ?? 50)));
    const [items, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: conv.id, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
      }),
      this.prisma.message.count({ where: { conversationId: conv.id, deletedAt: null } }),
    ]);
    // Reading the conversation settles its message notifications.
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, type: 'MESSAGE', readAt: null, data: { path: ['conversationId'], equals: conv.id } },
      data: { readAt: new Date() },
    });
    return {
      items: items.reverse().map((m) => ({ ...m, isMine: m.senderId === account.id })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async sendMessage(tenantId: string, userId: string, conversationId: string, body: string) {
    const text = String(body ?? '').trim();
    if (!text) throw new BadRequestException('Message body is required');
    const { account, conv, participants } = await this.participantConversation(userId, conversationId);

    const otherAccountIds = participants.filter((id) => id !== account.id);
    const others = otherAccountIds.length
      ? await this.prisma.socialAccount.findMany({ where: { id: { in: otherAccountIds } }, select: { userId: true } })
      : [];
    if (await this.blockedBetween(userId, others.map((o) => o.userId))) {
      throw new ForbiddenException('Messages to this person are not available');
    }

    const msg = await this.prisma.message.create({
      data: { conversationId: conv.id, senderId: account.id, body: text },
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    await this.prisma.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: msg.createdAt } });

    for (const o of others) {
      await this.notify({
        tenantId, recipientUserId: o.userId, actorUserId: userId, type: 'MESSAGE',
        title: `New message from ${account.displayName}`, body: text.slice(0, 140),
        link: `/messages?c=${conv.id}`, data: { conversationId: conv.id, messageId: msg.id },
      });
    }
    return { ...msg, isMine: true };
  }
}
