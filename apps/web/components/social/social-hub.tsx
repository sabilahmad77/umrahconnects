'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Globe, Hash, Loader2, MessageSquare, RefreshCw, TrendingUp, Users, Users2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, QueryFailure } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDiscoverPeople, useSavedPosts, useSocialAccount, useSocialFeed, useSocialPost, useTrendingPosts, type DiscoverPerson } from '@/hooks/use-social';
import { useOpenConversation, useRequestConnection } from '@/hooks/use-platform';
import { PostCard } from './post-card';
import { PostComposer } from './post-composer';
import { dedupeById, initialsOf } from './social-utils';

type Tab = 'all' | 'following' | 'saved';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All posts' },
  { key: 'following', label: 'Following' },
  { key: 'saved', label: 'Saved' },
];

export function SocialHub() {
  const params = useSearchParams();
  const router = useRouter();
  const { can, ready } = useCapabilities();
  const postId = params.get('post') ?? undefined;
  const tag = params.get('tag')?.replace(/^#/, '') || undefined;
  const [tab, setTab] = useState<Tab>('all');

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Social Hub</h1>
          <p className="mt-0.5 text-sm text-gray-600">Updates, questions and tips from the Umrah Connect community.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/social/groups" className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
            <Users2 aria-hidden="true" className="h-4 w-4" /> Groups
          </Link>
          <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white shadow-sm transition-colors hover:bg-brand-600">
            <Globe aria-hidden="true" className="h-4 w-4" /> Discover
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {postId ? (
            <SinglePost postId={postId} onBack={() => router.push('/social')} />
          ) : (
            <>
              {ready && can('social:post:create') && <PostComposer />}
              <div role="tablist" aria-label="Feed" className="flex flex-wrap items-center gap-1.5">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      tab === t.key ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
                {tag && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                    <Hash aria-hidden="true" className="h-3 w-3" />
                    {tag}
                    <button type="button" aria-label="Clear tag filter" onClick={() => router.push('/social')} className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100">
                      <X aria-hidden="true" className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              {tab === 'saved' ? <SavedList /> : <Feed followingOnly={tab === 'following'} tag={tag} />}
            </>
          )}
        </div>

        <aside className="space-y-4" aria-label="Community">
          <ProfilePanel />
          <TrendingPanel />
          <SuggestedPanel />
        </aside>
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="animate-pulse space-y-3 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gray-100" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-gray-100" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-3/4 rounded bg-gray-100" />
        </div>
      ))}
    </>
  );
}

function EmptyFeed({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
      <Globe aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-gray-200" />
      <p className="mb-1 text-sm text-gray-700">{title}</p>
      <p className="text-xs text-gray-600">{description}</p>
    </div>
  );
}

function Feed({ followingOnly, tag }: { followingOnly: boolean; tag?: string }) {
  const feed = useSocialFeed({ followingOnly, tag });
  const posts = dedupeById(feed.data?.pages.flatMap((p) => p.items) ?? []);

  if (feed.isLoading) return <FeedSkeleton />;
  if (feed.error) return <QueryFailure error={feed.error} onRetry={() => feed.refetch()} />;
  if (!posts.length) {
    return tag ? (
      <EmptyFeed title={`No posts tagged #${tag} yet`} description="Posts appear here when someone uses this hashtag." />
    ) : followingOnly ? (
      <EmptyFeed title="Nothing from people you follow yet" description="Follow people from Discover to see their posts here." />
    ) : (
      <EmptyFeed title="The feed is empty right now" description="Be the first to share an update." />
    );
  }
  return (
    <>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {feed.hasNextPage ? (
        <Button
          variant="quiet"
          onClick={() => feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-700"
        >
          {feed.isFetchingNextPage ? (
            <>
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading…
            </>
          ) : (
            <>
              <RefreshCw aria-hidden="true" className="h-4 w-4" /> Load more posts
            </>
          )}
        </Button>
      ) : (
        <p className="py-2 text-center text-xs text-gray-600">You’re all caught up.</p>
      )}
    </>
  );
}

function SavedList() {
  const saved = useSavedPosts();
  if (saved.isLoading) return <FeedSkeleton />;
  if (saved.error) return <QueryFailure error={saved.error} onRetry={() => saved.refetch()} />;
  if (!saved.data?.length) return <EmptyFeed title="No saved posts" description="Use the bookmark on a post to keep it here." />;
  return (
    <>
      {saved.data.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </>
  );
}

/** One post opened from a link or a notification, with its comments open. */
function SinglePost({ postId, onBack }: { postId: string; onBack: () => void }) {
  const post = useSocialPost(postId);
  const status = (post.error as any)?.response?.status;
  return (
    <div className="space-y-3">
      <Button variant="quiet" onClick={onBack} className="flex items-center gap-2 px-0 text-sm font-medium text-brand-700">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Back to the feed
      </Button>
      {post.isLoading ? (
        <FeedSkeleton />
      ) : status === 404 || status === 400 ? (
        <Alert title="This post is not available">It may have been deleted, or it is shared only with a different audience.</Alert>
      ) : post.error ? (
        <QueryFailure error={post.error} onRetry={() => post.refetch()} />
      ) : post.data ? (
        <PostCard key={post.data.id} post={post.data} commentsOpen />
      ) : null}
    </div>
  );
}

function ProfilePanel() {
  const { user } = useAuthContext();
  const account = useSocialAccount();
  const displayName = account.data?.displayName ?? user?.displayName ?? 'Community member';
  if (account.error) return <QueryFailure error={account.error} onRetry={() => account.refetch()} />;
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="h-16 bg-gradient-to-r from-brand-500 to-brand-600" />
      <div className="px-4 pb-4">
        <div aria-hidden="true" className="-mt-7 mb-3 flex h-14 w-14 items-center justify-center rounded-xl border-4 border-white bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-sm">
          {initialsOf(displayName)}
        </div>
        <p className="text-sm font-bold text-gray-900">{displayName}</p>
        {account.data?.bio && <p className="mt-0.5 text-xs text-gray-600">{account.data.bio}</p>}
        {user?.tenantName && <p className="mt-1 text-xs font-medium text-brand-600">{user.tenantName}</p>}
        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-200 pt-3">
          {[
            { label: 'Posts', value: account.data?._count?.posts },
            { label: 'Followers', value: account.data?._count?.followers },
            { label: 'Following', value: account.data?._count?.following },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <dd className="text-base font-bold text-gray-900">{account.isLoading ? '…' : s.value ?? '—'}</dd>
              <dt className="text-xs text-gray-600">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function TrendingPanel() {
  const trending = useTrendingPosts(20);
  const tags = Array.from(new Set((trending.data ?? []).flatMap((p) => p.tags ?? []))).slice(0, 8);
  if (trending.error) return <QueryFailure error={trending.error} onRetry={() => trending.refetch()} />;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp aria-hidden="true" className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-gray-900">Trending tags</h2>
      </div>
      {trending.isLoading ? (
        <p role="status" className="px-2 py-2 text-xs text-gray-600">Loading…</p>
      ) : tags.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {tags.map((tag) => (
            <Link key={tag} href={`/social?tag=${encodeURIComponent(tag)}`} className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-700">
              #{tag}
            </Link>
          ))}
        </div>
      ) : (
        <p className="px-2 py-2 text-xs text-gray-600">Tags appear here as the community uses #hashtags.</p>
      )}
    </div>
  );
}

function SuggestedPanel() {
  const router = useRouter();
  const people = useDiscoverPeople(undefined, 6);
  const requestConnection = useRequestConnection();
  const openConversation = useOpenConversation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const connect = async (p: DiscoverPerson) => {
    setBusyId(p.userId);
    try {
      await requestConnection.mutateAsync({ recipientId: p.userId });
      toast.success(`Connection request sent to ${p.displayName}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The connection request could not be sent. Try again.'));
    } finally {
      setBusyId(null);
    }
  };
  const message = async (p: DiscoverPerson) => {
    setBusyId(p.userId);
    try {
      const conv = await openConversation.mutateAsync(p.userId);
      router.push(`/messages?c=${conv.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The conversation could not be opened. Try again.'));
    } finally {
      setBusyId(null);
    }
  };

  if (people.error) return <QueryFailure error={people.error} onRetry={() => people.refetch()} />;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users aria-hidden="true" className="h-4 w-4 text-brand-500" />
        <h2 className="text-sm font-bold text-gray-900">People to connect with</h2>
      </div>
      {people.isLoading ? (
        <p role="status" className="px-2 py-2 text-xs text-gray-600">Loading…</p>
      ) : !people.data?.length ? (
        <p className="px-2 py-2 text-xs text-gray-600">No suggestions yet.</p>
      ) : (
        <ul className="space-y-3">
          {people.data.map((p) => {
            const status = p.connection?.status ?? 'NONE';
            const busy = busyId === p.userId;
            return (
              <li key={p.id} className="flex items-center gap-2.5">
                <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                  {initialsOf(p.displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-800">{p.displayName}</p>
                  <p className="truncate text-xs text-gray-600">{p.city || (p.type === 'PILGRIM' ? 'Traveler' : 'Provider')}</p>
                </div>
                {status === 'ACCEPTED' ? (
                  <Button variant="quiet" busy={busy} onClick={() => message(p)} aria-label={`Message ${p.displayName}`} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                    {!busy && <MessageSquare aria-hidden="true" className="h-3 w-3" />} Message
                  </Button>
                ) : status === 'PENDING' && p.connection.direction === 'INCOMING' ? (
                  <Link href="/connections" className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                    Respond
                  </Link>
                ) : status === 'PENDING' ? (
                  <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">Requested</span>
                ) : status === 'UNAVAILABLE' ? null : (
                  <Button variant="quiet" busy={busy} onClick={() => connect(p)} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                    Connect
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/discover" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
        <Globe aria-hidden="true" className="h-3 w-3" /> See everyone in Discover
      </Link>
    </div>
  );
}
