'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// ── Detail ──
export function useGroup(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'detail'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}`);
      return data.data as any;
    },
    enabled: !!id,
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/groups/${id}`, payload);
      return data.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['groups', vars.id] });
    },
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/groups/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

// ── Members ──
export function useGroupMembers(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'members'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/members`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userId, role }: { groupId: string; userId: string; role?: string }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/members`, { userId, role });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'members'] }),
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      await apiClient.delete(`/groups/${groupId}/members/${userId}`);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'members'] }),
  });
}

// ── Invites ──
export function useGroupInvites(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'invites'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/invites`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateGroupInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, ...body }: { groupId: string; inviteeUserId?: string; inviteeEmail?: string; message?: string }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/invites`, body);
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'invites'] }),
  });
}

// ── Discussion ──
export function useGroupPosts(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'posts'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/posts`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateGroupPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, body, mediaUrls }: { groupId: string; body: string; mediaUrls?: string[] }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/posts`, { body, mediaUrls });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'posts'] }),
  });
}

export function useDeleteGroupPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, postId }: { groupId: string; postId: string }) => {
      await apiClient.delete(`/groups/posts/${postId}`);
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'posts'] }),
  });
}

export function useGroupPostComments(postId?: string) {
  return useQuery({
    queryKey: ['groupPost', postId, 'comments'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/posts/${postId}/comments`);
      return data.data as any[];
    },
    enabled: !!postId,
  });
}

export function useCreateGroupPostComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      const { data } = await apiClient.post(`/groups/posts/${postId}/comments`, { body });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groupPost', vars.postId, 'comments'] }),
  });
}

// ── Polls ──
export function useGroupPolls(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'polls'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/polls`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateGroupPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, question, options, isMultiple, closesAt }: { groupId: string; question: string; options: string[]; isMultiple?: boolean; closesAt?: string }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/polls`, { question, options, isMultiple, closesAt });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'polls'] }),
  });
}

export function useVoteGroupPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, pollId, optionIndices }: { groupId: string; pollId: string; optionIndices: number[] }) => {
      const { data } = await apiClient.post(`/groups/polls/${pollId}/vote`, { optionIndices });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'polls'] }),
  });
}

// ── Notes ──
export function useGroupNotes(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'notes'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/notes`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useCreateGroupNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, title, body, category, pinned }: { groupId: string; title: string; body?: string; category?: string; pinned?: boolean }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/notes`, { title, body, category, pinned });
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'notes'] }),
  });
}

export function useUpdateGroupNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, ...body }: { noteId: string } & Record<string, any>) => {
      const { data } = await apiClient.put(`/groups/notes/${noteId}`, body);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useDeleteGroupNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      await apiClient.delete(`/groups/notes/${noteId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

// ── Documents ──
export function useGroupDocuments(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'documents'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/documents`);
      return data.data as any[];
    },
    enabled: !!id,
  });
}

export function useAddGroupDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, ...body }: { groupId: string; name: string; url: string; mimeType?: string; sizeBytes?: number; description?: string }) => {
      const { data } = await apiClient.post(`/groups/${groupId}/documents`, body);
      return data.data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'documents'] }),
  });
}

export function useDeleteGroupDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      await apiClient.delete(`/groups/documents/${documentId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

// ── Related entities (bookings, transport, marketplace) ──
export function useGroupRelated(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'related'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}/related`);
      return data.data as { bookings: any[]; transportAssignments: any[] };
    },
    enabled: !!id,
  });
}
