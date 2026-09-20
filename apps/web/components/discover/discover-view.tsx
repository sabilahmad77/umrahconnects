'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, MessageSquare, Search, TrendingUp, UserPlus, Users, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, QueryFailure } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDiscoverGroups, useDiscoverPeople, useSetFollow, useTrendingPosts, type DiscoverPerson } from '@/hooks/use-social';
import { useOpenConversation, useRequestConnection } from '@/hooks/use-platform';
import { PostCard } from '@/components/social/post-card';
import { initialsOf, plural } from '@/components/social/social-utils';

type TabKey = 'people' | 'groups' | 'trending';

/** Waits until the user stops typing before searching. */
function useDebounced<T>(value: T, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function DiscoverView() {
  const [tab, setTab] = useState<TabKey>('people');
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim());

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discover</h1>
        <p className="mt-0.5 text-sm text-gray-600">Find people, public groups and what’s trending across the community.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {tab !== 'trending' && (
          <div className="flex w-full items-center gap-2 rounded-xl border border-gray-500 bg-white px-3 py-2.5 sm:w-72">
            <Search aria-hidden="true" className="h-4 w-4 text-gray-600" />
            <Input
              aria-label={tab === 'people' ? 'Search people by name or city' : 'Search groups by name'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === 'people' ? 'Search people…' : 'Search groups…'}
              className="min-h-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-gray-600"
            />
          </div>
        )}
        <div role="tablist" {...tablistKeys()} aria-label="Discover" className="flex gap-1.5">
          {(['people', 'groups', 'trending'] as TabKey[]).map((t) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === t}
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                tab === t ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'people' && <People search={query} />}
      {tab === 'groups' && <Groups search={query} />}
      {tab === 'trending' && <Trending />}
    </div>
  );
}

function People({ search }: { search: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const people = useDiscoverPeople(search || undefined, 30);
  const setFollow = useSetFollow();
  const requestConnection = useRequestConnection();
  const openConversation = useOpenConversation();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<unknown>, fallback: string) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast.error(apiErrorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  if (people.error) return <QueryFailure error={people.error} onRetry={() => people.refetch()} />;
  if (people.isLoading) return <Skeleton />;
  if (!people.data?.length) return <Empty icon={Users} label={search ? `No people match “${search}”` : 'No people to show yet'} />;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {people.data.map((p: DiscoverPerson) => {
        const status = p.connection?.status ?? 'NONE';
        return (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md">
            <div className="flex items-start gap-3">
              <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                {initialsOf(p.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{p.displayName}</p>
                <p className="text-xs text-gray-600">{p.type === 'PILGRIM' ? 'Traveler' : 'Provider'}</p>
                {p.city && (
                  <p className="inline-flex items-center gap-1 text-xs text-gray-600">
                    <MapPin aria-hidden="true" className="h-3 w-3" />
                    {p.city}
                  </p>
                )}
              </div>
            </div>
            {p.bio && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{p.bio}</p>}
            {(p.travelInterests ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.travelInterests!.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3 text-xs">
              <span className="text-gray-600">{plural(p.followerCount ?? 0, 'follower')}</span>
              <div className="flex items-center gap-1.5">
                {can('social:post:create') && (
                  <Button
                    variant="quiet"
                    busy={busy === `follow:${p.id}`}
                    aria-pressed={p.isFollowing}
                    onClick={() =>
                      run(
                        `follow:${p.id}`,
                        async () => {
                          const res = await setFollow.mutateAsync({ accountId: p.id, following: !p.isFollowing });
                          toast.success(res.following ? `Following ${p.displayName}` : `Unfollowed ${p.displayName}`);
                        },
                        'Could not update the follow. Try again.',
                      )
                    }
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      p.isFollowing ? 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200' : 'border-brand-200 bg-white text-brand-700 hover:bg-brand-50',
                    )}
                  >
                    {p.isFollowing ? 'Following' : 'Follow'}
                  </Button>
                )}
                {status === 'ACCEPTED' ? (
                  <Button
                    variant="quiet"
                    busy={busy === `dm:${p.id}`}
                    onClick={() =>
                      run(
                        `dm:${p.id}`,
                        async () => {
                          const conv = await openConversation.mutateAsync(p.userId);
                          router.push(`/messages?c=${conv.id}`);
                        },
                        'The conversation could not be opened. Try again.',
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700 hover:bg-brand-100"
                  >
                    <MessageSquare aria-hidden="true" className="h-3 w-3" /> Message
                  </Button>
                ) : status === 'PENDING' && p.connection.direction === 'INCOMING' ? (
                  <Link href="/connections" className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700 hover:bg-brand-100">
                    Respond to request
                  </Link>
                ) : status === 'PENDING' ? (
                  <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs text-gray-600">Request sent</span>
                ) : status === 'UNAVAILABLE' ? null : (
                  <Button
                    variant="quiet"
                    busy={busy === `connect:${p.id}`}
                    onClick={() =>
                      run(
                        `connect:${p.id}`,
                        async () => {
                          await requestConnection.mutateAsync({ recipientId: p.userId });
                          toast.success(`Connection request sent to ${p.displayName}`);
                        },
                        'The connection request could not be sent. Try again.',
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700 hover:bg-brand-100"
                  >
                    <UserPlus aria-hidden="true" className="h-3 w-3" /> Connect
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Groups({ search }: { search: string }) {
  const groups = useDiscoverGroups(search || undefined);
  if (groups.error) return <QueryFailure error={groups.error} onRetry={() => groups.refetch()} />;
  if (groups.isLoading) return <Skeleton />;
  if (!groups.data?.length) return <Empty icon={Users2} label={search ? `No public groups match “${search}”` : 'No public groups yet'} />;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {groups.data.map((g: any) => (
        <Link key={g.id} href={`/social/groups/${g.id}`} className="block rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
          <div className="flex items-start gap-3">
            <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-saudi-50 text-saudi-700">
              <Users2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{g.name}</p>
              <p className="text-xs text-gray-600">
                {g.tripType ?? 'Group'} • {plural(g._count?.members ?? 0, 'member')} • {plural(g._count?.posts ?? 0, 'post')}
              </p>
            </div>
          </div>
          {g.description && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{g.description}</p>}
          {(g.departureDate || g.returnDate) && (
            <p className="mt-2 text-xs text-gray-600">
              {g.departureDate ? new Date(g.departureDate).toLocaleDateString() : 'Date to be confirmed'} →{' '}
              {g.returnDate ? new Date(g.returnDate).toLocaleDateString() : 'Date to be confirmed'}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function Trending() {
  const trending = useTrendingPosts(20);
  if (trending.error) return <QueryFailure error={trending.error} onRetry={() => trending.refetch()} />;
  if (trending.isLoading) return <Skeleton />;
  if (!trending.data?.length) return <Empty icon={TrendingUp} label="No trending posts yet" />;
  return (
    <div className="max-w-2xl space-y-4">
      {trending.data.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl border border-gray-200 bg-white p-4" />
      ))}
    </div>
  );
}

function Empty({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
      <Icon aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-gray-200" />
      <p className="text-sm text-gray-600">{label}</p>
    </div>
  );
}
