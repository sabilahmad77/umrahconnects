import { Injectable, NotFoundException } from '@nestjs/common';

export type PostVisibility = 'public' | 'followers' | 'group' | 'private';
export type ModerationStatus = 'published' | 'under_review' | 'removed' | 'flagged';
export type ReactionType = 'like' | 'love' | 'pray' | 'celebrate' | 'support';

export interface CreatePostDto {
  body: string;
  mediaUrls?: string[];
  visibility?: PostVisibility;
  groupId?: string;
  tags?: string[];
}

export interface Post {
  id: string;
  tenantId: string;
  authorId: string;
  body: string;
  mediaUrls: string[];
  visibility: PostVisibility;
  groupId?: string;
  tags: string[];
  commentCount: number;
  reactionCount: number;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  parentCommentId?: string;
  moderationStatus: ModerationStatus;
  createdAt: Date;
}

export interface Reaction {
  id: string;
  accountId: string;
  postId: string;
  type: ReactionType;
  createdAt: Date;
}

export interface Follow {
  followerId: string;
  followedId: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessageAt?: Date;
  createdAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt?: Date;
  createdAt: Date;
}

export interface FeedOptions {
  page?: number;
  limit?: number;
  visibility?: PostVisibility;
  groupId?: string;
  authorId?: string;
  tags?: string[];
}

export interface ModerationDecision {
  postId: string;
  moderatorId: string;
  status: ModerationStatus;
  notes?: string;
  decidedAt: Date;
}

export interface Report {
  id: string;
  postId: string;
  reporterId: string;
  reason: string;
  createdAt: Date;
}

@Injectable()
export class SocialService {
  /**
   * Create a new post on behalf of a user within a tenant.
   * Applies default visibility, stores media URLs, and queues for moderation if needed.
   */
  async createPost(tenantId: string, userId: string, dto: CreatePostDto): Promise<Post> {
    // TODO: implement - persist to plugin_social.posts
    // TODO: if body contains flagged keywords, set moderationStatus = 'under_review'
    // TODO: emit 'social.post.created' domain event for feed fanout
    throw new Error('Not implemented');
  }

  /**
   * Return a personalized feed for an account.
   * Combines posts from followed accounts, groups, and public posts.
   * Applies chronological sorting and cursor-based pagination.
   */
  async getFeed(
    accountId: string,
    options: FeedOptions = {},
  ): Promise<{ data: Post[]; total: number; nextCursor?: string }> {
    // TODO: implement - union query: followed accounts + groups + public
    // TODO: apply visibility filters, pagination, and tag filters
    // TODO: exclude posts with moderationStatus = 'removed'
    return { data: [], total: 0 };
  }

  /**
   * Add a comment to a post. Supports nested comments via parentCommentId.
   */
  async createComment(postId: string, authorId: string, body: string, parentCommentId?: string): Promise<Comment> {
    // TODO: implement - create comment, increment post.commentCount
    // TODO: notify post author via notification system
    throw new Error('Not implemented');
  }

  /**
   * Toggle a reaction on a post for an account.
   * If the account has already reacted with the same type, removes the reaction.
   * If reacting with a different type, replaces the existing reaction.
   */
  async toggleReaction(accountId: string, postId: string, type: ReactionType): Promise<{ active: boolean; reaction?: Reaction }> {
    // TODO: implement - upsert/delete from plugin_social.reactions
    // TODO: update post.reactionCount accordingly
    return { active: false };
  }

  /**
   * Follow another account. Idempotent — does nothing if already following.
   */
  async followAccount(followerId: string, followedId: string): Promise<Follow> {
    // TODO: implement - insert into plugin_social.follows (ignore if exists)
    // TODO: notify followed account
    throw new Error('Not implemented');
  }

  /**
   * Unfollow an account. Idempotent.
   */
  async unfollowAccount(followerId: string, followedId: string): Promise<void> {
    // TODO: implement - delete from plugin_social.follows
  }

  /**
   * Get or create a 1:1 conversation between participants, then send a message.
   */
  async sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
    // TODO: implement - persist message, update conversation.lastMessageAt
    // TODO: push real-time notification to recipients via WebSocket/WhatsApp
    throw new Error('Not implemented');
  }

  /**
   * Apply a moderation decision to a post (publish, remove, flag).
   * Records the moderator and reason for audit trail.
   */
  async moderatePost(
    postId: string,
    moderatorId: string,
    status: ModerationStatus,
    notes?: string,
  ): Promise<ModerationDecision> {
    // TODO: implement - update post.moderationStatus
    // TODO: if status = 'removed', notify post author
    // TODO: create audit record in plugin_social.moderation_log
    throw new NotFoundException(`Post ${postId} not found`);
  }

  /**
   * Report a post for policy violation. Creates a report and flags the post for review.
   */
  async reportPost(postId: string, reporterId: string, reason: string): Promise<Report> {
    // TODO: implement - create report record in plugin_social.reports
    // TODO: if reportCount >= threshold, auto-flag for moderator review
    throw new NotFoundException(`Post ${postId} not found`);
  }

  // ── Additional helpers ────────────────────────────────────────────────────

  async getPost(postId: string): Promise<Post> {
    // TODO: implement - load post by id
    throw new NotFoundException(`Post ${postId} not found`);
  }

  async getComments(postId: string, page = 1, limit = 20): Promise<{ data: Comment[]; total: number }> {
    // TODO: implement - paginated comment listing
    return { data: [], total: 0 };
  }

  async getFollowers(accountId: string): Promise<string[]> {
    // TODO: implement - list follower account IDs
    return [];
  }

  async getFollowing(accountId: string): Promise<string[]> {
    // TODO: implement - list following account IDs
    return [];
  }

  async getOrCreateConversation(participantIds: string[]): Promise<Conversation> {
    // TODO: implement - find existing 1:1 or create new conversation
    throw new Error('Not implemented');
  }

  async getMessages(
    conversationId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: Message[]; total: number }> {
    // TODO: implement - paginated message history
    return { data: [], total: 0 };
  }

  async getModerationQueue(tenantId: string): Promise<Post[]> {
    // TODO: implement - posts with moderationStatus = 'under_review' or 'flagged'
    return [];
  }

  async getReportedPosts(tenantId: string): Promise<{ post: Post; reportCount: number }[]> {
    // TODO: implement - posts with reports, grouped by postId
    return [];
  }
}
