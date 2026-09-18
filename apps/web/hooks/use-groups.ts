'use client';

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

/**
 * Trip-group hooks. Management hooks call capability-gated routes (crm:pilgrim:*)
 * inside the caller's organization; member hooks (my groups, invitations,
 * discussion, polls, join/leave) work for travelers too. The server decides.
 */

// ── Lists ──
export function useGroups(params?: { page?: number; limit?: number; search?: string; status?: string }, enabled = true) {
  return useQuery({
    queryKey: ['groups', 'list', params],
    enabled,
    queryFn: async () =>
      (await apiClient.get('/groups', { params })).data.data as { items: any[]; total: number; page: number; limit: number; totalPages: number },
  });
}

export function useGroupStats(enabled = true) {
  return useQuery({
    queryKey: ['groups', 'stats'],
    enabled,
    queryFn: async () =>
      (await apiClient.get('/groups/stats')).data.data as { total: number; active: number; completed: number; incidents: number; openIncidents?: number },
  });
}

/** PUBLIC groups (any organization) that anyone can join. */
export function usePublicGroups(params?: { search?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['groups', 'public', params],
    queryFn: async () => (await apiClient.get('/groups/public', { params })).data.data as { items: any[]; total: number },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: Record<string, any>) => (await apiClient.post('/groups', dto)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

// ── Membership (self-service) ──
export function useMyGroupInvites() {
  return useQuery({
    queryKey: ['groups', 'invites', 'mine'],
    queryFn: async () => (await apiClient.get('/groups/invites/mine')).data.data as { id: string; message?: string; createdAt: string; group: any }[],
  });
}

export function useRespondGroupInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId, accept }: { inviteId: string; accept: boolean }) =>
      (await apiClient.post(`/groups/invites/${inviteId}/respond`, { accept })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useJoinGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => (await apiClient.post(`/groups/${groupId}/join`, {})).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useLeaveGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => (await apiClient.post(`/groups/${groupId}/leave`, {})).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

// ── Detail ──
/**
 * One group. The managing organization receives the full record; members,
 * invitees and link holders receive the public-safe view. `viewer` says what
 * the caller may do (canManage, membership, pendingInvite, canJoin).
 */
export function useGroup(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'detail'],
    queryFn: async () => {
      const { data } = await apiClient.get(`/groups/${id}`);
      return data.data as any;
    },
    enabled: !!id,
    retry: (count, error: any) => ![400, 403, 404].includes(error?.response?.status) && count < 2,
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

export function useRevokeGroupInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ inviteId }: { groupId: string; inviteId: string }) =>
      (await apiClient.post(`/groups/invites/${inviteId}/revoke`)).data.data,
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'invites'] }),
  });
}

// ── Discussion ──
/** The group's discussion, pinned first then newest, as pages ("Load more"). */
export function useGroupPosts(id?: string, limit = 10) {
  return useInfiniteQuery({
    queryKey: ['groups', id, 'posts'],
    enabled: !!id,
    queryFn: async ({ pageParam }) =>
      (await apiClient.get(`/groups/${id}/posts`, { params: { page: pageParam, limit } })).data.data as {
        items: any[];
        total: number;
        page: number;
        totalPages: number;
      },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

export function useCreateGroupPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, body, isPinned }: { groupId: string; body: string; isPinned?: boolean }) => {
      // The server honours isPinned only for the managing organization.
      const { data } = await apiClient.post(`/groups/${groupId}/posts`, { body, ...(isPinned ? { isPinned } : {}) });
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
    mutationFn: async ({ postId, body }: { postId: string; body: string; groupId?: string }) => {
      const { data } = await apiClient.post(`/groups/posts/${postId}/comments`, { body });
      return data.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['groupPost', vars.postId, 'comments'] });
      if (vars.groupId) qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'posts'] });
    },
  });
}

export function useDeleteGroupPostComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, commentId }: { postId: string; commentId: string; groupId?: string }) =>
      (await apiClient.delete(`/groups/posts/${postId}/comments/${commentId}`)).data.data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['groupPost', vars.postId, 'comments'] });
      if (vars.groupId) qc.invalidateQueries({ queryKey: ['groups', vars.groupId, 'posts'] });
    },
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

export function useCloseGroupPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pollId }: { groupId: string; pollId: string }) => (await apiClient.post(`/groups/polls/${pollId}/close`)).data.data,
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

// ── Incidents ──
export function useGroupIncidents(id?: string) {
  return useQuery({
    queryKey: ['groups', id, 'incidents'],
    enabled: !!id,
    queryFn: async () => (await apiClient.get(`/groups/${id}/incidents`)).data.data as any[],
  });
}

export function useCreateGroupIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, ...body }: { groupId: string; type: string; severity: string; description: string; location?: string }) =>
      (await apiClient.post(`/groups/${groupId}/incidents`, body)).data.data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['groups', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['groups', 'stats'] });
    },
  });
}

export function useResolveGroupIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, incidentId, resolution }: { groupId: string; incidentId: string; resolution: string }) =>
      (await apiClient.put(`/groups/${groupId}/incidents/${incidentId}`, { resolution, resolvedAt: new Date().toISOString() })).data.data,
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['groups', vars.groupId] });
      qc.invalidateQueries({ queryKey: ['groups', 'stats'] });
    },
  });
}

export function useMyGroups() {
  return useQuery({ queryKey: ['groups', 'mine'], queryFn: async () => (await apiClient.get('/groups/mine')).data.data as any[] });
}
