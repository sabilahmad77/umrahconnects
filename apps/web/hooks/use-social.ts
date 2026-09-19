'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { PostVisibility } from '@/components/social/social-utils';

// ─── Contracts (see platform/api/src/modules/social) ─────────────────────────

export interface SocialAuthor {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
}

export interface SocialPost {
  id: string;
  authorId: string;
  author: SocialAuthor | null;
  type: string;
  visibility: PostVisibility;
  body: string | null;
  mediaUrls: string[];
  tags: string[];
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  likedByMe: boolean;
  savedByMe: boolean;
  /** Server-computed ownership: only the author may edit or delete. */
  isMine: boolean;
  targetRoles?: string[];
  moderationStatus?: string;
  savedAt?: string;
}

export interface SocialComment {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  author: SocialAuthor | null;
  createdAt: string;
  editedAt: string | null;
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  replyCount?: number;
  moderationStatus?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FeedFilter {
  followingOnly?: boolean;
  tag?: string;
}

const nextPage = (last: Paged<unknown>) => (last.page < last.totalPages ? last.page + 1 : undefined);

// ─── Cache helpers ───────────────────────────────────────────────────────────

type PostCache = InfiniteData<Paged<SocialPost>> | SocialPost[] | SocialPost | undefined;

/**
 * Applies a server-confirmed change to every cached copy of a post (all feed
 * filters, the saved list and the single-post view), so counts and state update
 * at once without refetching every loaded page.
 */
function patchPost(qc: QueryClient, postId: string, patch: (post: SocialPost) => SocialPost | null) {
  const apply = (data: PostCache): PostCache => {
    if (!data) return data;
    if (Array.isArray(data)) return data.map((p) => (p.id === postId ? patch(p) : p)).filter(Boolean) as SocialPost[];
    if ('pages' in data) {
      return {
        ...data,
        pages: data.pages.map((pg) => ({
          ...pg,
          items: pg.items.map((p) => (p.id === postId ? patch(p) : p)).filter(Boolean) as SocialPost[],
        })),
      };
    }
    if ((data as SocialPost).id === postId) return (patch(data as SocialPost) ?? undefined) as PostCache;
    return data;
  };
  qc.setQueriesData<PostCache>({ queryKey: ['social', 'feed'] }, apply);
  qc.setQueriesData<PostCache>({ queryKey: ['social', 'saved'] }, apply);
  qc.setQueriesData<PostCache>({ queryKey: ['social', 'post', postId] }, apply);
}

// ─── Social account ──────────────────────────────────────────────────────────

export function useSocialAccount() {
  return useQuery({
    queryKey: ['social', 'account', 'me'],
    queryFn: async () => (await apiClient.get('/social/accounts/me')).data.data,
    retry: 1,
  });
}

export function useUpdateSocialAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { displayName?: string; bio?: string; avatarUrl?: string; coverUrl?: string }) =>
      (await apiClient.put('/social/accounts/me', dto)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'account'] }),
  });
}

// ─── Feed & posts ────────────────────────────────────────────────────────────

/** The feed as pages ("Load more"). Filters: people you follow, or one tag. */
export function useSocialFeed(filter: FeedFilter = {}, limit = 10) {
  return useInfiniteQuery({
    queryKey: ['social', 'feed', filter],
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get('/social/feed', {
          params: { page: pageParam, limit, ...(filter.followingOnly ? { followingOnly: true } : {}), ...(filter.tag ? { tag: filter.tag } : {}) },
        })
      ).data.data as Paged<SocialPost>,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** One post (the deep link `/social?post=<id>` and notification targets). */
export function useSocialPost(postId?: string) {
  return useQuery({
    queryKey: ['social', 'post', postId],
    enabled: !!postId,
    retry: (count, error: any) => error?.response?.status !== 404 && count < 2,
    queryFn: async () => (await apiClient.get(`/social/posts/${postId}`)).data.data as SocialPost,
  });
}

export function useSavedPosts(enabled = true) {
  return useQuery({
    queryKey: ['social', 'saved'],
    enabled,
    queryFn: async () => (await apiClient.get('/social/saved-posts')).data.data as SocialPost[],
  });
}

export interface CreatePostInput {
  type: string;
  content: string;
  visibility: PostVisibility;
  targetRoles?: string[];
  tags?: string[];
  mediaUrls?: string[];
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreatePostInput) =>
      (
        await apiClient.post('/social/posts', {
          type: dto.type,
          content: dto.content,
          visibility: dto.visibility,
          ...(dto.visibility === 'ROLE_SET' ? { targetRoles: dto.targetRoles } : {}),
          ...(dto.tags?.length ? { tags: dto.tags } : {}),
          ...(dto.mediaUrls?.length ? { mediaUrls: dto.mediaUrls } : {}),
        })
      ).data.data as SocialPost,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
    },
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, ...dto }: { postId: string; content?: string; visibility?: PostVisibility; targetRoles?: string[]; tags?: string[] }) =>
      (await apiClient.put(`/social/posts/${postId}`, dto)).data.data as SocialPost,
    onSuccess: (post) => {
      patchPost(qc, post.id, (p) => ({ ...p, ...post }));
      // An audience change can move the post in or out of filtered feeds.
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => (await apiClient.delete(`/social/posts/${postId}`)).data.data as { id: string },
    onSuccess: (_data, postId) => {
      patchPost(qc, postId, () => null);
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
      qc.invalidateQueries({ queryKey: ['social', 'saved'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
    },
  });
}

// ─── Reactions & saves (desired state: a repeated click cannot undo itself) ──

export function useSetLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) =>
      (await apiClient.post(`/social/posts/${postId}/react`, { type: 'LIKE', active: liked })).data.data as {
        likeCount: number;
        likedByMe: boolean;
      },
    onSuccess: (res, { postId }) => patchPost(qc, postId, (p) => ({ ...p, likeCount: res.likeCount, likedByMe: res.likedByMe })),
  });
}

export function useSetSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, saved }: { postId: string; saved: boolean }) =>
      (await apiClient.post(`/social/posts/${postId}/save`, { saved })).data.data as { saved: boolean; saveCount: number },
    onSuccess: (res, { postId }) => {
      patchPost(qc, postId, (p) => ({ ...p, savedByMe: res.saved, saveCount: res.saveCount }));
      qc.invalidateQueries({ queryKey: ['social', 'saved'] });
    },
  });
}

// ─── Comments & replies ──────────────────────────────────────────────────────

/** Top-level comments (newest first) or, with `parentId`, one thread's replies (oldest first). */
export function usePostComments(postId: string, opts: { parentId?: string; enabled?: boolean; limit?: number } = {}) {
  const { parentId, enabled = true, limit = parentId ? 20 : 10 } = opts;
  return useInfiniteQuery({
    queryKey: ['social', 'comments', postId, parentId ?? 'top'],
    enabled,
    queryFn: async ({ pageParam }) =>
      (
        await apiClient.get(`/social/posts/${postId}/comments`, { params: { page: pageParam, limit, ...(parentId ? { parentId } : {}) } })
      ).data.data as Paged<SocialComment>,
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, content, parentId }: { postId: string; content: string; parentId?: string }) =>
      (await apiClient.post(`/social/posts/${postId}/comments`, { content, ...(parentId ? { parentId } : {}) })).data
        .data as SocialComment,
    onSuccess: (comment) => {
      patchPost(qc, comment.postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      qc.invalidateQueries({ queryKey: ['social', 'comments', comment.postId] });
    },
  });
}

export function useEditComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, commentId, content }: { postId: string; commentId: string; content: string }) =>
      (await apiClient.put(`/social/posts/${postId}/comments/${commentId}`, { content })).data.data as SocialComment,
    onSuccess: (comment) => qc.invalidateQueries({ queryKey: ['social', 'comments', comment.postId] }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, commentId }: { postId: string; commentId: string }) =>
      (await apiClient.delete(`/social/posts/${postId}/comments/${commentId}`)).data.data as { removed: number },
    onSuccess: (res, { postId }) => {
      patchPost(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - (res.removed ?? 1)) }));
      qc.invalidateQueries({ queryKey: ['social', 'comments', postId] });
    },
  });
}

// ─── Media (real uploads through POST /uploads; images only) ─────────────────

export function useUploadImage() {
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return (await apiClient.post('/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data as {
        url: string;
        size: number;
        mime: string;
      };
    },
  });
}

// ─── Follow ──────────────────────────────────────────────────────────────────

export function useSetFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ accountId, following }: { accountId: string; following: boolean }) =>
      (await apiClient.post(`/social/accounts/${accountId}/follow`, { following })).data.data as { following: boolean; followerCount: number },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'discover'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

// ─── Discover ────────────────────────────────────────────────────────────────

export interface DiscoverPerson {
  id: string;
  userId: string;
  type: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  travelInterests?: string[];
  isVerified?: boolean;
  followerCount: number;
  isFollowing: boolean;
  connection: { status: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE'; direction?: 'OUTGOING' | 'INCOMING'; connectionId?: string };
}

export function useDiscoverPeople(search?: string, limit?: number) {
  return useQuery({
    queryKey: ['social', 'discover', 'people', search ?? '', limit ?? 12],
    queryFn: async () =>
      (await apiClient.get('/social/discover/people', { params: { ...(search ? { search } : {}), ...(limit ? { limit } : {}) } })).data
        .data as DiscoverPerson[],
  });
}

export function useDiscoverGroups(search?: string) {
  return useQuery({
    queryKey: ['social', 'discover', 'groups', search ?? ''],
    queryFn: async () => (await apiClient.get('/social/discover/groups', { params: search ? { search } : {} })).data.data as any[],
  });
}

export function useTrendingPosts(limit = 10) {
  return useQuery({
    queryKey: ['social', 'discover', 'trending', limit],
    queryFn: async () => (await apiClient.get('/social/discover/trending', { params: { limit } })).data.data as SocialPost[],
  });
}
