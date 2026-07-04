'use client';

import { useState } from 'react';
import {
  Heart, MessageCircle, Share2, MoreHorizontal, BadgeCheck,
  Image, Hash, Globe, Send, Loader2, Users, TrendingUp,
  BookmarkPlus, ThumbsUp, RefreshCw, Plus, Video, BarChart3,
  Pencil, HelpCircle, Lightbulb, Star, AlertTriangle, Gift,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import {
  useSocialFeedPaginated,
  useCreatePost,
  useToggleReaction,
  useAddComment,
  useSocialAccount,
  useToggleSavePost,
  useDiscoverPeople,
  useTrendingPosts,
} from '@/hooks/use-social';
import { useRequestConnection } from '@/hooks/use-platform';

// ─── Post Composer ────────────────────────────────────────────────────────────

function PostComposer() {
  const [body, setBody] = useState('');
  const [type, setType] = useState('UPDATE');
  const { user } = useAuthContext();
  const { mutateAsync: createPost, isPending } = useCreatePost();

  const initials = (user?.displayName ?? 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const submit = async () => {
    if (!body.trim()) return;
    await createPost({ type, body, visibility: 'PUBLIC' });
    setBody('');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share an update, tip, or experience with the Umrah community…"
            rows={3}
            className="w-full text-sm bg-gray-50 rounded-xl px-3 py-2.5 outline-none resize-none border border-gray-200 focus:border-brand-300 focus:ring-2 focus:ring-brand-100 transition-all placeholder:text-gray-400"
          />
          {/* Media actions (frontend-ready; upload backend pending) */}
          <div className="flex items-center gap-1 mt-2 pb-2.5 border-b border-gray-50">
            {[
              { label: 'Photo', Icon: Image,     color: 'text-emerald-600' },
              { label: 'Video', Icon: Video,     color: 'text-blue-600' },
              { label: 'Poll',  Icon: BarChart3, color: 'text-gold-600' },
            ].map((m) => (
              <button
                key={m.label}
                onClick={() => toast.info(`${m.label} upload connects to the media backend when enabled.`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <m.Icon className={cn('h-4 w-4', m.color)} />
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex flex-wrap gap-1.5">
              {[
                { type: 'UPDATE',     label: 'Update',     Icon: Pencil },
                { type: 'QUESTION',   label: 'Question',   Icon: HelpCircle },
                { type: 'GUIDELINE',  label: 'Tip',        Icon: Lightbulb },
                { type: 'STORY',      label: 'Experience', Icon: Star },
                { type: 'OFFER',      label: 'Offer',      Icon: Gift },
              ].map((t) => (
                <button
                  key={t.type}
                  onClick={() => setType(t.type)}
                  className={cn(
                    'inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-colors',
                    type === t.type
                      ? 'bg-brand-50 text-brand-700 border-brand-300'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  <t.Icon className="h-3 w-3" />
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={!body.trim() || isPending}
              className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors shadow-sm"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Post Card ────────────────────────────────────────────────────────────────

const POST_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: any }> = {
  UPDATE:      { label: 'Update',     color: 'bg-gray-100 text-gray-600',       Icon: Pencil },
  QUESTION:    { label: 'Question',   color: 'bg-purple-100 text-purple-700',   Icon: HelpCircle },
  GUIDELINE:   { label: 'Tip',        color: 'bg-yellow-100 text-yellow-700',   Icon: Lightbulb },
  STORY:       { label: 'Experience', color: 'bg-blue-100 text-blue-700',       Icon: Star },
  OFFER:       { label: 'Offer',      color: 'bg-green-100 text-green-700',     Icon: Gift },
  EVENT:       { label: 'Event',      color: 'bg-indigo-100 text-indigo-700',   Icon: AlertTriangle },
  PARTNERSHIP: { label: 'Partnership',color: 'bg-rose-100 text-rose-700',       Icon: Star },
};

function PostCard({ post }: { post: any }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const { mutateAsync: toggleReaction } = useToggleReaction();
  const { mutateAsync: addComment, isPending: commentPending } = useAddComment();
  const { mutateAsync: toggleSave } = useToggleSavePost();

  const displayName = post.author?.displayName ?? post.author?.account?.displayName ?? 'Umrah Community';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const timeAgo = post.createdAt ? formatTimeAgo(new Date(post.createdAt)) : '';
  const typeCfg = POST_TYPE_CONFIG[post.type] ?? POST_TYPE_CONFIG.UPDATE;
  const likeCount = (post._count?.reactions ?? post.likeCount ?? 0) + (liked ? 1 : 0);
  const commentCount = post._count?.comments ?? post.commentCount ?? 0;
  const shareCount = post._count?.shares ?? post.shareCount ?? 0;
  const postImage = post.imageUrl ?? (Array.isArray(post.mediaUrls) ? post.mediaUrls[0] : undefined)
    ?? (Array.isArray(post.media) ? post.media[0]?.url : undefined);

  const handleLike = async () => {
    setLiked(!liked);
    await toggleReaction({ postId: post.id, type: 'LIKE' }).catch(() => setLiked(liked));
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    await addComment({ postId: post.id, body: commentText });
    setCommentText('');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900">{displayName}</p>
              {post.author?.verified && <BadgeCheck className="h-3.5 w-3.5 text-brand-500" />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[11px] text-gray-400">{timeAgo}</p>
              {post.type && (
                <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md', typeCfg.color)}>
                  <typeCfg.Icon className="h-2.5 w-2.5" />
                  {typeCfg.label}
                </span>
              )}
            </div>
          </div>
        </div>
        <button className="p-1.5 hover:bg-gray-50 rounded-lg transition-colors">
          <MoreHorizontal className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Body */}
      <div className="px-5 pb-3">
        <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-line">{post.body}</p>

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {post.tags.map((tag: string) => (
              <span key={tag} className="text-[11px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-brand-100 transition-colors">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Media (real image when present) */}
      {postImage && (
        <div className="border-y border-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={postImage} alt="" className="w-full max-h-[460px] object-cover" />
        </div>
      )}

      {/* Engagement summary */}
      {(likeCount > 0 || commentCount > 0 || shareCount > 0) && (
        <div className="flex items-center justify-between px-5 pt-3 text-[12px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-4.5 h-4.5 rounded-full bg-red-500">
              <Heart className="h-2.5 w-2.5 text-white fill-current" />
            </span>
            {likeCount > 0 && <span>{likeCount}</span>}
          </div>
          <div className="flex items-center gap-3">
            {commentCount > 0 && <span>{commentCount} comments</span>}
            {shareCount > 0 && <span>{shareCount} shares</span>}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 px-3 py-1.5 mt-2 border-t border-gray-50">
        <button
          onClick={handleLike}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition-all font-medium',
            liked ? 'text-red-500 bg-red-50' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
          )}
        >
          <Heart className={cn('h-[18px] w-[18px]', liked && 'fill-current')} />
          <span>Like</span>
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all font-medium"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          <span>Comment</span>
        </button>
        <button
          onClick={() => toggleReaction({ postId: post.id, type: 'SHARE' }).catch(() => {})}
          className="flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-all font-medium"
        >
          <Share2 className="h-[18px] w-[18px]" />
          <span>Share</span>
        </button>
        <button
          onClick={async () => {
            try { const res = await toggleSave(post.id); setSaved(res.saved); } catch { /* no-op */ }
          }}
          className={cn(
            'p-2 rounded-xl transition-colors',
            saved ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
          )}
          title={saved ? 'Saved' : 'Save'}
        >
          <BookmarkPlus className={cn('h-[18px] w-[18px]', saved && 'fill-current')} />
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="px-5 pb-4 border-t border-gray-50 pt-3 space-y-3">
          {post.comments?.slice(0, 3).map((c: any) => (
            <div key={c.id} className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 text-[10px] font-bold shrink-0">
                {(c.author?.displayName ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-xs font-semibold text-gray-700">{c.author?.displayName ?? 'User'}</p>
                <p className="text-xs text-gray-600 mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComment()}
              placeholder="Write a comment…"
              className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-300 transition-colors"
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || commentPending}
              className="p-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {commentPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Panel ────────────────────────────────────────────────────────────

function ProfilePanel() {
  const { user } = useAuthContext();
  const { data: account } = useSocialAccount();

  const displayName = account?.displayName ?? user?.displayName ?? 'Community Member';
  const bio = account?.bio ?? 'Umrah operator & community member';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Cover */}
      <div className="h-16 bg-gradient-to-r from-brand-500 to-brand-600" />
      <div className="px-4 pb-4">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-lg font-bold border-4 border-white -mt-7 mb-3 shadow-sm">
          {initials}
        </div>
        <p className="font-bold text-gray-900 text-sm">{displayName}</p>
        <p className="text-xs text-gray-500 mt-0.5">{bio}</p>
        {user?.tenantName && (
          <p className="text-[11px] text-brand-600 font-medium mt-1">🏢 {user.tenantName}</p>
        )}
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
          {[
            { label: 'Posts',      value: account?._count?.posts ?? 0 },
            { label: 'Followers',  value: account?._count?.followers ?? 0 },
            { label: 'Following',  value: account?._count?.following ?? 0 },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-base font-bold text-gray-900">{s.value}</p>
              <p className="text-[10px] text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Trending Topics (real data) ────────────────────────────────────────────

function TrendingPanel() {
  const { data } = useTrendingPosts();
  const posts: any[] = (data as any)?.items ?? (data as any) ?? [];
  // Derive real hashtags from the trending posts' tags
  const tags = Array.from(new Set(posts.flatMap((p) => p?.tags ?? []))).slice(0, 8) as string[];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-bold text-gray-900">Trending</h3>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {tags.map((tag) => (
            <button key={tag} className="text-left text-xs text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1.5 rounded-lg transition-colors font-medium">
              #{String(tag).replace(/^#/, '')}
            </button>
          ))}
        </div>
      ) : posts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {posts.slice(0, 4).map((p) => (
            <div key={p.id} className="text-xs text-gray-600 line-clamp-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
              {p.body}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 px-2 py-2">Topics will appear as the community posts.</p>
      )}
    </div>
  );
}

// ─── Suggested Connections (real data) ───────────────────────────────────────

function SuggestedPanel() {
  const { data } = useDiscoverPeople();
  const people: any[] = (data as any)?.items ?? (data as any) ?? [];
  const requestConnection = useRequestConnection();
  const [done, setDone] = useState<Record<string, boolean>>({});

  const onConnect = async (p: any) => {
    const recipientId = p.userId ?? p.id;
    if (!recipientId) return;
    try {
      await requestConnection.mutateAsync({ recipientId, message: 'Let’s connect on Umrah Connect.' } as any);
      setDone((prev) => ({ ...prev, [recipientId]: true }));
    } catch { /* already requested / not allowed */ setDone((prev) => ({ ...prev, [recipientId]: true })); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-brand-500" />
        <h3 className="text-sm font-bold text-gray-900">Suggested connections</h3>
      </div>
      {people.length === 0 ? (
        <p className="text-xs text-gray-400 px-2 py-2">No suggestions yet.</p>
      ) : (
        <div className="space-y-3">
          {people.slice(0, 6).map((u) => {
            const id = u.userId ?? u.id;
            const name = u.displayName ?? u.name ?? 'Community member';
            const role = u.tenant?.name ?? u.tenantName ?? u.role ?? u.headline ?? 'Umrah Connect';
            const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={id} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{role}</p>
                </div>
                <button
                  onClick={() => onConnect(u)}
                  disabled={done[id]}
                  className={cn(
                    'text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors',
                    done[id]
                      ? 'bg-gray-100 text-gray-500 border-gray-200'
                      : 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100',
                  )}
                >
                  {done[id] ? 'Requested' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Main Social Hub ──────────────────────────────────────────────────────────

export function SocialHub() {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useSocialFeedPaginated(10);

  const posts = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Hub</h1>
          <p className="text-sm text-gray-500 mt-0.5">Umrah operator community · real-time updates</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30">
            <Globe className="h-4 w-4" />
            Discover
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5">
        {/* Feed */}
        <div className="space-y-4">
          <PostComposer />

          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-100" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-32 bg-gray-100 rounded" />
                    <div className="h-3 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="h-3 w-full bg-gray-100 rounded" />
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            ))
          ) : posts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center">
              <Globe className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400 mb-1">The feed is empty right now</p>
              <p className="text-xs text-gray-400">Be the first to share an update!</p>
            </div>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}

          {/* Load More */}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full py-3 border border-gray-200 rounded-2xl text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              {isFetchingNextPage ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
              ) : (
                <><RefreshCw className="h-4 w-4" /> Load more posts</>
              )}
            </button>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <ProfilePanel />
          <TrendingPanel />
          <SuggestedPanel />
        </div>
      </div>
    </div>
  );
}
