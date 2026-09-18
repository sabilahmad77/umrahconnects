'use client';

import { useState } from 'react';
import { CornerDownRight, Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, QueryFailure, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useAddComment, useDeleteComment, useEditComment, usePostComments, type SocialComment } from '@/hooks/use-social';
import { dedupeById, formatTimeAgo, initialsOf, MAX_COMMENT_LENGTH, plural } from './social-utils';

/**
 * A post's comments: newest top-level comments first with "View more", one
 * level of replies per comment, and edit/delete for the viewer's own comments
 * (the server's rule, surfaced as `canEdit` / `canDelete` on each comment).
 */
export function PostComments({ postId, autoFocus = false }: { postId: string; autoFocus?: boolean }) {
  const { can } = useCapabilities();
  const canWrite = can('social:post:create');
  const comments = usePostComments(postId);
  const items = dedupeById(comments.data?.pages.flatMap((p) => p.items) ?? []);
  const total = comments.data?.pages[0]?.total ?? 0;
  const remaining = Math.max(0, total - items.length);

  return (
    <section aria-label="Comments" className="space-y-3 border-t border-gray-100 px-5 pb-4 pt-3">
      {canWrite && <CommentComposer postId={postId} autoFocus={autoFocus} placeholder="Write a comment…" />}
      {comments.isLoading ? (
        <p role="status" className="flex items-center gap-2 text-xs text-gray-600">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Loading comments…
        </p>
      ) : comments.error ? (
        <QueryFailure error={comments.error} onRetry={() => comments.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-600">No comments yet.{canWrite ? ' Start the conversation.' : ''}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <CommentItem key={c.id} comment={c} postId={postId} canWrite={canWrite} />
          ))}
        </ul>
      )}
      {comments.hasNextPage && (
        <Button
          variant="quiet"
          busy={comments.isFetchingNextPage}
          onClick={() => comments.fetchNextPage()}
          className="px-0 text-xs font-semibold text-brand-700"
        >
          View {plural(remaining, 'more comment')}
        </Button>
      )}
    </section>
  );
}

function CommentComposer({
  postId,
  parentId,
  placeholder,
  autoFocus,
  onPosted,
}: {
  postId: string;
  parentId?: string;
  placeholder: string;
  autoFocus?: boolean;
  onPosted?: () => void;
}) {
  const [text, setText] = useState('');
  const add = useAddComment();
  const submit = async () => {
    const content = text.trim();
    if (!content || add.isPending) return;
    try {
      await add.mutateAsync({ postId, content, parentId });
      setText('');
      onPosted?.();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your comment could not be posted. Try again.'));
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={parentId ? 'Write a reply' : 'Write a comment'}
        value={text}
        maxLength={MAX_COMMENT_LENGTH}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="min-h-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs outline-none transition-colors focus:border-brand-300"
      />
      <Button
        variant="quiet"
        aria-label={parentId ? 'Post reply' : 'Post comment'}
        onClick={submit}
        disabled={!text.trim()}
        busy={add.isPending}
        className="rounded-xl bg-brand-500 p-2 text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {!add.isPending && <Send aria-hidden="true" className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function CommentItem({ comment, postId, canWrite, isReply = false }: { comment: SocialComment; postId: string; canWrite: boolean; isReply?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  const edit = useEditComment();
  const remove = useDeleteComment();
  const name = comment.author?.displayName ?? 'Member';
  const replyCount = comment.replyCount ?? 0;

  const save = async () => {
    const content = draft.trim();
    if (!content) return;
    try {
      await edit.mutateAsync({ postId, commentId: comment.id, content });
      setEditing(false);
      toast.success('Comment updated');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your changes could not be saved. Try again.'));
    }
  };
  const destroy = async () => {
    const warning = !isReply && replyCount > 0 ? ` Its ${plural(replyCount, 'reply', 'replies')} will be removed too.` : '';
    if (!window.confirm(`Delete this comment?${warning}`)) return;
    try {
      await remove.mutateAsync({ postId, commentId: comment.id });
      toast.success('Comment deleted');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The comment could not be deleted. Try again.'));
    }
  };

  return (
    <li className="flex items-start gap-2.5" data-comment-id={comment.id}>
      <div
        aria-hidden="true"
        className={cn('flex shrink-0 items-center justify-center rounded-lg bg-gray-100 font-bold text-gray-600', isReply ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-xs')}
      >
        {initialsOf(name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-xl bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold text-gray-700">
            {name}
            {comment.moderationStatus === 'REJECTED' && <span className="ml-2 font-normal text-red-700">Hidden by moderation</span>}
          </p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                aria-label="Edit comment"
                value={draft}
                maxLength={MAX_COMMENT_LENGTH}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-0 w-full text-xs"
              />
              <div className="flex gap-2">
                <Button onClick={save} busy={edit.isPending} disabled={!draft.trim()} className="px-3 py-1.5 text-xs">
                  Save
                </Button>
                <Button
                  variant="secondary"
                  disabled={edit.isPending}
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(false);
                  }}
                  className="px-3 py-1.5 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-line break-words text-xs text-gray-700">{comment.body}</p>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-gray-600">
          <span>{formatTimeAgo(comment.createdAt)}</span>
          {comment.editedAt && <span>Edited</span>}
          {canWrite && !isReply && (
            <button type="button" onClick={() => setReplying((v) => !v)} className="inline-flex items-center gap-1 font-semibold hover:text-brand-700">
              <CornerDownRight aria-hidden="true" className="h-3 w-3" /> Reply
            </button>
          )}
          {canWrite && comment.canEdit && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 font-semibold hover:text-brand-700">
              <Pencil aria-hidden="true" className="h-3 w-3" /> Edit
            </button>
          )}
          {canWrite && comment.canDelete && (
            <button
              type="button"
              onClick={destroy}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1 font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="h-3 w-3" /> Delete
            </button>
          )}
          {!isReply && replyCount > 0 && (
            <button
              type="button"
              aria-expanded={showReplies}
              onClick={() => setShowReplies((v) => !v)}
              className="font-semibold text-brand-700 hover:underline"
            >
              {showReplies ? 'Hide replies' : `View ${plural(replyCount, 'reply', 'replies')}`}
            </button>
          )}
        </div>
        {!isReply && (showReplies || replying) && (
          <div className="mt-2 space-y-2 border-l-2 border-gray-100 pl-3">
            {showReplies && <CommentReplies postId={postId} parentId={comment.id} canWrite={canWrite} />}
            {replying && (
              <CommentComposer
                postId={postId}
                parentId={comment.id}
                autoFocus
                placeholder={`Reply to ${name}…`}
                onPosted={() => {
                  setReplying(false);
                  setShowReplies(true);
                }}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function CommentReplies({ postId, parentId, canWrite }: { postId: string; parentId: string; canWrite: boolean }) {
  const replies = usePostComments(postId, { parentId });
  const items = dedupeById(replies.data?.pages.flatMap((p) => p.items) ?? []);
  if (replies.isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-gray-600">
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Loading replies…
      </p>
    );
  }
  if (replies.error) return <QueryFailure error={replies.error} onRetry={() => replies.refetch()} />;
  return (
    <>
      <ul className="space-y-2">
        {items.map((r) => (
          <CommentItem key={r.id} comment={r} postId={postId} canWrite={canWrite} isReply />
        ))}
      </ul>
      {replies.hasNextPage && (
        <Button variant="quiet" busy={replies.isFetchingNextPage} onClick={() => replies.fetchNextPage()} className="px-0 text-xs font-semibold text-brand-700">
          View more replies
        </Button>
      )}
    </>
  );
}
