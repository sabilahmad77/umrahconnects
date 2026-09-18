'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { BadgeCheck, BookmarkPlus, Heart, Link2, Lock, MessageCircle, MoreHorizontal, Pencil, Share2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDeletePost, useSetLike, useSetSaved, useUpdatePost, type SocialPost } from '@/hooks/use-social';
import { PostComments } from './post-comments';
import {
  AUDIENCE_ROLES,
  AUDIENCES,
  audienceLabel,
  extractHashtags,
  formatTimeAgo,
  initialsOf,
  MAX_POST_LENGTH,
  plural,
  POST_TYPE_LABELS,
  postLink,
  type PostVisibility,
} from './social-utils';

const TYPE_COLORS: Record<string, string> = {
  UPDATE: 'bg-gray-100 text-gray-600',
  QUESTION: 'bg-purple-100 text-purple-700',
  GUIDELINE: 'bg-yellow-100 text-yellow-800',
  STORY: 'bg-blue-100 text-blue-700',
  OFFER: 'bg-green-100 text-green-800',
  EVENT: 'bg-indigo-100 text-indigo-700',
  PARTNERSHIP: 'bg-rose-100 text-rose-700',
};

export function PostCard({ post, commentsOpen = false }: { post: SocialPost; commentsOpen?: boolean }) {
  const { can } = useCapabilities();
  const canWrite = can('social:post:create');
  const canRead = can('social:post:read');
  const [showComments, setShowComments] = useState(commentsOpen);
  const [editing, setEditing] = useState(false);
  const setLike = useSetLike();
  const setSaved = useSetSaved();
  const remove = useDeletePost();

  // While a like/save is in flight, show the requested state; the server's answer
  // then replaces it in every cached copy of the post (or the error reverts it).
  const liked = setLike.isPending && setLike.variables ? setLike.variables.liked : post.likedByMe;
  const likeCount = post.likeCount + (liked === post.likedByMe ? 0 : liked ? 1 : -1);
  const saved = setSaved.isPending && setSaved.variables ? setSaved.variables.saved : post.savedByMe;
  const name = post.author?.displayName ?? 'Community member';
  const owner = post.isMine && canWrite;

  const toggleLike = async () => {
    try {
      await setLike.mutateAsync({ postId: post.id, liked: !post.likedByMe });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your like could not be saved. Try again.'));
    }
  };
  const toggleSave = async () => {
    try {
      const res = await setSaved.mutateAsync({ postId: post.id, saved: !post.savedByMe });
      toast.success(res.saved ? 'Saved to your bookmarks' : 'Removed from your bookmarks');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'This post could not be saved. Try again.'));
    }
  };
  const copyLink = async () => {
    const url = new URL(postLink(post.id), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      toast.success(post.visibility === 'PUBLIC' ? 'Link copied' : 'Link copied — only this post’s audience can open it');
    } catch {
      toast.info(`Copy this link: ${url}`);
    }
  };
  const destroy = async () => {
    if (!window.confirm('Delete this post? Its comments will no longer be visible.')) return;
    try {
      await remove.mutateAsync(post.id);
      toast.success('Post deleted');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The post could not be deleted. Try again.'));
    }
  };

  return (
    <article aria-label={`Post by ${name}`} data-post-id={post.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm">
      <header className="flex items-start justify-between px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
            {initialsOf(name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
              {post.author?.isVerified && <BadgeCheck aria-label="Verified account" className="h-3.5 w-3.5 shrink-0 text-brand-500" />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
              <span>{formatTimeAgo(post.createdAt)}</span>
              {post.editedAt && <span>· Edited</span>}
              <span className={cn('rounded-md px-1.5 py-0.5 font-medium', TYPE_COLORS[post.type] ?? TYPE_COLORS.UPDATE)}>{POST_TYPE_LABELS[post.type] ?? 'Update'}</span>
              {post.visibility !== 'PUBLIC' && (
                <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                  {post.visibility === 'CUSTOM_SET' ? <Lock aria-hidden="true" className="h-2.5 w-2.5" /> : <Users aria-hidden="true" className="h-2.5 w-2.5" />}
                  {audienceLabel(post.visibility)}
                </span>
              )}
              {post.moderationStatus && ['HELD_FOR_REVIEW', 'REJECTED', 'SHADOW_BANNED'].includes(post.moderationStatus) && (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-900">Only you can see this post (moderation)</span>
              )}
            </div>
          </div>
        </div>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button variant="quiet" aria-label="Post options" className="rounded-lg p-1.5 hover:bg-gray-50">
              <MoreHorizontal aria-hidden="true" className="h-4 w-4 text-gray-600" />
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content align="end" sideOffset={6} className="z-[60] min-w-44 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
              <Dropdown.Item onSelect={copyLink} className="uc-menu-item">
                <Link2 aria-hidden="true" className="h-4 w-4" /> Copy link
              </Dropdown.Item>
              {owner && (
                <>
                  <Dropdown.Item onSelect={() => setEditing(true)} className="uc-menu-item">
                    <Pencil aria-hidden="true" className="h-4 w-4" /> Edit post
                  </Dropdown.Item>
                  <Dropdown.Item onSelect={destroy} className="uc-menu-item text-red-700">
                    <Trash2 aria-hidden="true" className="h-4 w-4" /> Delete post
                  </Dropdown.Item>
                </>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </header>

      {editing ? (
        <PostEditor post={post} onDone={() => setEditing(false)} />
      ) : (
        <div className="px-5 pb-3">
          {post.body && <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-gray-800">{post.body}</p>}
          {post.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Link key={tag} href={`/social?tag=${encodeURIComponent(tag)}`} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100">
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {post.mediaUrls?.length > 0 && !editing && (
        <div className={cn('grid gap-0.5 border-y border-gray-50', post.mediaUrls.length > 1 && 'grid-cols-2')}>
          {post.mediaUrls.slice(0, 4).map((url) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={url} src={url} alt="" loading="lazy" className="max-h-[460px] w-full object-cover" />
          ))}
        </div>
      )}

      {(likeCount > 0 || post.commentCount > 0) && (
        <div className="flex items-center justify-between px-5 pt-3 text-[12px] text-gray-600">
          <span>{likeCount > 0 ? plural(likeCount, 'like') : ''}</span>
          {post.commentCount > 0 && (
            <button type="button" onClick={() => setShowComments(true)} className="hover:underline">
              {plural(post.commentCount, 'comment')}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 border-t border-gray-50 px-3 py-1.5">
        {canWrite && (
          <Button
            variant="quiet"
            aria-pressed={liked}
            aria-label={liked ? 'Unlike' : 'Like'}
            onClick={toggleLike}
            disabled={setLike.isPending}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all',
              liked ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700',
            )}
          >
            <Heart aria-hidden="true" className={cn('h-[18px] w-[18px]', liked && 'fill-current')} />
            <span>{liked ? 'Liked' : 'Like'}</span>
          </Button>
        )}
        <Button
          variant="quiet"
          aria-expanded={showComments}
          onClick={() => setShowComments((v) => !v)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-700"
        >
          <MessageCircle aria-hidden="true" className="h-[18px] w-[18px]" />
          <span>Comment</span>
        </Button>
        <Button
          variant="quiet"
          onClick={copyLink}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-700"
        >
          <Share2 aria-hidden="true" className="h-[18px] w-[18px]" />
          <span>Share</span>
        </Button>
        {canRead && (
          <Button
            variant="quiet"
            onClick={toggleSave}
            disabled={setSaved.isPending}
            aria-pressed={saved}
            aria-label={saved ? 'Unsave post' : 'Save post'}
            title={saved ? 'Saved' : 'Save'}
            className={cn('rounded-xl p-2 transition-colors', saved ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50')}
          >
            <BookmarkPlus aria-hidden="true" className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />
          </Button>
        )}
      </div>

      {showComments && <PostComments postId={post.id} autoFocus={!commentsOpen} />}
    </article>
  );
}

/** Inline editor for the author: text and audience (tags follow the #hashtags in the text). */
function PostEditor({ post, onDone }: { post: SocialPost; onDone: () => void }) {
  const [body, setBody] = useState(post.body ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility);
  const [roles, setRoles] = useState<string[]>(post.targetRoles ?? []);
  const update = useUpdatePost();
  const needsRoles = visibility === 'ROLE_SET' && roles.length === 0;
  const empty = !body.trim() && !post.mediaUrls?.length;

  const save = async () => {
    if (empty || needsRoles) return;
    try {
      await update.mutateAsync({
        postId: post.id,
        content: body.trim(),
        visibility,
        ...(visibility === 'ROLE_SET' ? { targetRoles: roles } : {}),
        tags: extractHashtags(body),
      });
      toast.success('Post updated');
      onDone();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Your changes could not be saved. Try again.'));
    }
  };

  return (
    <div className="space-y-3 px-5 pb-3">
      <Textarea aria-label="Edit post" value={body} maxLength={MAX_POST_LENGTH} rows={4} onChange={(e) => setBody(e.target.value)} className="w-full text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-gray-600" htmlFor={`audience-${post.id}`}>
          Audience
        </label>
        <Select
          id={`audience-${post.id}`}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PostVisibility)}
          className="min-h-0 w-auto py-1.5 text-xs"
        >
          {AUDIENCES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>
      {visibility === 'ROLE_SET' && <RolePicker value={roles} onChange={setRoles} />}
      {needsRoles && <p className="text-xs text-red-700">Choose at least one account type.</p>}
      <div className="flex gap-2">
        <Button onClick={save} busy={update.isPending} disabled={empty || needsRoles} className="px-4 py-2 text-sm">
          Save changes
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={update.isPending} className="px-4 py-2 text-sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RolePicker({ value, onChange }: { value: string[]; onChange: (roles: string[]) => void }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Account types that can see this post</legend>
      {AUDIENCE_ROLES.map((r) => {
        const checked = value.includes(r.code);
        return (
          <label
            key={r.code}
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
              checked ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600',
            )}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-brand-500"
              checked={checked}
              onChange={() => onChange(checked ? value.filter((c) => c !== r.code) : [...value, r.code])}
            />
            {r.label}
          </label>
        );
      })}
    </fieldset>
  );
}
