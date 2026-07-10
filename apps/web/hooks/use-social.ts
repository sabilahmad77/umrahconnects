'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ─── Social Account ───────────────────────────────────────────────────────────

export function useSocialAccount() {
  return useQuery({
    queryKey: ['social', 'account', 'me'],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/accounts/me');
      return data.data;
    },
    retry: 1,
  });
}

export function useUpdateSocialAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { displayName?: string; bio?: string; avatarUrl?: string; coverUrl?: string }) => {
      const { data } = await apiClient.put('/social/accounts/me', dto);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'account'] }),
  });
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export function useSocialFeedPaginated(limit = 10) {
  return useInfiniteQuery({
    queryKey: ['social', 'feed'],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await apiClient.get('/social/feed', { params: { page: pageParam, limit } });
      return data.data as { items: any[]; total: number };
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.flatMap((p) => p.items).length;
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: {
      type: string;
      // Accept both `body` (legacy) and `content` (API) for callers' convenience
      body?: string;
      content?: string;
      visibility?: string;
      tags?: string[];
      structuredData?: Record<string, any>;
    }) => {
      const payload = {
        type: dto.type,
        // API expects `content`
        content: dto.content ?? dto.body ?? '',
        visibility: dto.visibility ?? 'PUBLIC',
        tags: dto.tags,
      };
      const { data } = await apiClient.post('/social/posts', payload);
      return data.data;
    },
    // FIX-07: refresh the feed AND the profile account (posts counter) so the
    // profile/dashboard counters update immediately after posting.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      await apiClient.delete(`/social/posts/${postId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
    },
  });
}

// ─── Reactions ────────────────────────────────────────────────────────────────

export function useToggleReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, type }: { postId: string; type: string }) => {
      const { data } = await apiClient.post(`/social/posts/${postId}/react`, { type });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'feed'] }),
  });
}

// ─── Follow ───────────────────────────────────────────────────────────────────

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data } = await apiClient.post(`/social/accounts/${accountId}/follow`);
      return data.data as { following: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'discover'] });
      qc.invalidateQueries({ queryKey: ['social', 'account'] });
    },
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, body, content }: { postId: string; body?: string; content?: string }) => {
      const { data } = await apiClient.post(`/social/posts/${postId}/comments`, {
        content: content ?? body ?? '',
      });
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['social', 'feed'] }),
  });
}

// ─── Save / bookmark ──────────────────────────────────────────────────────
export function useToggleSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { data } = await apiClient.post(`/social/posts/${postId}/save`);
      return data.data as { saved: boolean };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
      qc.invalidateQueries({ queryKey: ['social', 'saved'] });
    },
  });
}

export function useSavedPosts() {
  return useQuery({
    queryKey: ['social', 'saved'],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/saved-posts');
      return data.data as any[];
    },
  });
}

// ─── Discover ─────────────────────────────────────────────────────────────
export function useDiscoverPeople(search?: string) {
  return useQuery({
    queryKey: ['social', 'discover', 'people', search],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/discover/people', { params: { search } });
      return data.data as any[];
    },
  });
}

export function useDiscoverGroups(search?: string) {
  return useQuery({
    queryKey: ['social', 'discover', 'groups', search],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/discover/groups', { params: { search } });
      return data.data as any[];
    },
  });
}

export function useTrendingPosts() {
  return useQuery({
    queryKey: ['social', 'discover', 'trending'],
    queryFn: async () => {
      const { data } = await apiClient.get('/social/discover/trending');
      return data.data as any[];
    },
  });
}
