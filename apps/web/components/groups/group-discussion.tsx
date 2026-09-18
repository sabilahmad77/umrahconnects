'use client';

import { useState } from 'react';
import { Loader2, MessageSquare, Pin, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, QueryFailure, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import {
  useCreateGroupPost,
  useCreateGroupPostComment,
  useDeleteGroupPost,
  useDeleteGroupPostComment,
  useGroupPostComments,
  useGroupPosts,
} from '@/hooks/use-groups';
import { dedupeById, formatTimeAgo, initialsOf, plural } from '@/components/social/social-utils';

/**
 * A trip group's discussion, shared by the organization's management view and
 * the members' view. Who may delete what comes from the server (`canDelete`).
 */
export function GroupDiscussion({ groupId, canPost, canPin }: { groupId: string; canPost: boolean; canPin: boolean }) {
  const posts = useGroupPosts(groupId);
  const createPost = useCreateGroupPost();
  const deletePost = useDeleteGroupPost();
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const items = dedupeById(posts.data?.pages.flatMap((p) => p.items) ?? []);
  const total = posts.data?.pages[0]?.total ?? 0;

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await createPost.mutateAsync({ groupId, body: body.trim(), isPinned: canPin && pinned });
      setBody('');
      setPinned(false);
      toast.success('Posted to the group');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your post could not be published. Try again.'));
    }
  };

  const remove = async (postId: string) => {
    if (!window.confirm('Delete this post and its comments?')) return;
    try {
      await deletePost.mutateAsync({ groupId, postId });
      toast.success('Post deleted');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The post could not be deleted. Try again.'));
    }
  };

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Textarea
            aria-label="Write to the group"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Share an update with the group…"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {canPin ? (
              <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                Pin to the top
              </label>
            ) : (
              <span />
            )}
            <Button
              variant="quiet"
              onClick={submit}
              busy={createPost.isPending}
              disabled={!body.trim()}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {!createPost.isPending && <Send aria-hidden="true" className="h-4 w-4" />} Post
            </Button>
          </div>
        </div>
      )}

      {posts.error ? (
        <QueryFailure error={posts.error} onRetry={() => posts.refetch()} />
      ) : posts.isLoading ? (
        <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-gray-600">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> Loading discussion…
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-600">
          No posts yet{canPost ? ' — be the first to share an update.' : '.'}
        </div>
      ) : (
        <ul className="space-y-3" aria-label={`Group posts (${total})`}>
          {items.map((p: any) => (
            <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-4" data-group-post-id={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
                    {initialsOf(p.authorName)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {p.authorName ?? 'Member'}
                      {p.isPinned && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-800">
                          <Pin aria-hidden="true" className="h-3 w-3" /> Pinned
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-600">{formatTimeAgo(p.createdAt)}</p>
                  </div>
                </div>
                {p.canDelete && (
                  <Button
                    variant="quiet"
                    aria-label="Delete post"
                    busy={deletePost.isPending && deletePost.variables?.postId === p.id}
                    onClick={() => remove(p.id)}
                    className="rounded p-1.5 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{p.body}</p>
              <GroupComments groupId={groupId} postId={p.id} count={p.commentCount ?? 0} canPost={canPost} />
            </li>
          ))}
        </ul>
      )}
      {posts.hasNextPage && (
        <Button
          variant="quiet"
          busy={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
          className="w-full rounded-xl border border-gray-200 py-3 text-sm text-gray-600 hover:bg-gray-50"
        >
          Load more posts
        </Button>
      )}
    </div>
  );
}

function GroupComments({ groupId, postId, count, canPost }: { groupId: string; postId: string; count: number; canPost: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const comments = useGroupPostComments(open ? postId : undefined);
  const create = useCreateGroupPostComment();
  const remove = useDeleteGroupPostComment();

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await create.mutateAsync({ postId, body: body.trim(), groupId });
      setBody('');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your comment could not be posted. Try again.'));
    }
  };
  const destroy = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await remove.mutateAsync({ postId, commentId, groupId });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The comment could not be deleted. Try again.'));
    }
  };

  return (
    <div className="mt-3 border-t border-gray-50 pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline">
        <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
        {open ? 'Hide comments' : count > 0 ? `Show ${plural(count, 'comment')}` : canPost ? 'Comment' : 'No comments'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {comments.error ? (
            <QueryFailure error={comments.error} onRetry={() => comments.refetch()} />
          ) : comments.isLoading ? (
            <p role="status" className="text-xs text-gray-600">Loading comments…</p>
          ) : (
            <ul className="space-y-2">
              {(comments.data ?? []).map((c: any) => (
                <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                  <div className="min-w-0">
                    <p className="mb-0.5 font-semibold text-gray-800">
                      {c.authorName ?? 'Member'} <span className="font-normal text-gray-600">· {formatTimeAgo(c.createdAt)}</span>
                    </p>
                    <p className="whitespace-pre-wrap break-words">{c.body}</p>
                  </div>
                  {c.canDelete && (
                    <button type="button" aria-label="Delete comment" onClick={() => destroy(c.id)} disabled={remove.isPending} className="shrink-0 rounded p-1 text-red-700 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 aria-hidden="true" className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canPost && (
            <div className="flex gap-2">
              <Input
                aria-label="Write a comment"
                value={body}
                maxLength={5000}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Write a comment…"
                className="min-h-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-xs outline-none"
              />
              <Button variant="quiet" onClick={submit} busy={create.isPending} disabled={!body.trim()} className="rounded-lg bg-brand-500 px-3 py-2 text-xs text-white disabled:opacity-50">
                Send
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
