'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Users, Users2, TrendingUp, Search, UserPlus, MapPin, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDiscoverPeople, useDiscoverGroups, useTrendingPosts, useToggleFollow } from '@/hooks/use-social';
import { useRequestConnection } from '@/hooks/use-platform';

type TabKey = 'people' | 'groups' | 'trending';

export function DiscoverView() {
  const [tab, setTab] = useState<TabKey>('people');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discover</h1>
        <p className="text-sm text-gray-500 mt-0.5">Find people, groups, and what's trending across the community.</p>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1.5">
          {(['people', 'groups', 'trending'] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'capitalize text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
                tab === t ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'people' && <People search={search} />}
      {tab === 'groups' && <Groups search={search} />}
      {tab === 'trending' && <Trending />}
    </div>
  );
}

function People({ search }: { search: string }) {
  const { data: people = [], isLoading } = useDiscoverPeople(search || undefined);
  const requestConn = useRequestConnection();
  const toggleFollow = useToggleFollow();
  if (isLoading) return <Skeleton />;
  if (people.length === 0) return <Empty icon={Users} label="No people found" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {people.map((p: any) => (
        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md transition-shadow">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
              {p.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (p.displayName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{p.displayName}</p>
              {p.city && <p className="text-[11px] text-gray-500 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.city}</p>}
            </div>
          </div>
          {p.bio && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.bio}</p>}
          {(p.travelInterests ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.travelInterests.slice(0, 3).map((t: string) => (
                <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}
          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50 text-[11px]">
            <span className="text-gray-500">{p.followerCount ?? 0} followers</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={async () => {
                  try {
                    const res = await toggleFollow.mutateAsync(p.id);
                    toast.success(res.following ? `Following ${p.displayName}` : `Unfollowed ${p.displayName}`);
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error?.message ?? 'Failed');
                  }
                }}
                className={cn(
                  'text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                  p.isFollowing
                    ? 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                    : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50',
                )}
              >
                {p.isFollowing ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={async () => {
                  try {
                    await requestConn.mutateAsync({ recipientId: p.userId });
                    toast.success('Connection request sent');
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error?.message ?? 'Failed');
                  }
                }}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100"
              >
                <UserPlus className="h-3 w-3" /> Connect
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Groups({ search }: { search: string }) {
  const { data: groups = [], isLoading } = useDiscoverGroups(search || undefined);
  if (isLoading) return <Skeleton />;
  if (groups.length === 0) return <Empty icon={Users2} label="No public groups found" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map((g: any) => (
        <Link key={g.id} href={`/groups/${g.id}`} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all block">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-saudi-50 text-saudi-700 flex items-center justify-center">
              <Users2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
              <p className="text-[11px] text-gray-500">
                {g.tripType ?? 'GROUP'} • {g._count?.members ?? 0} members • {g._count?.posts ?? 0} posts
              </p>
            </div>
          </div>
          {g.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{g.description}</p>}
          {(g.departureDate || g.returnDate) && (
            <p className="text-[11px] text-gray-500 mt-2">
              {g.departureDate ? new Date(g.departureDate).toLocaleDateString() : '?'} → {g.returnDate ? new Date(g.returnDate).toLocaleDateString() : '?'}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

function Trending() {
  const { data: posts = [], isLoading } = useTrendingPosts();
  if (isLoading) return <Skeleton />;
  if (posts.length === 0) return <Empty icon={TrendingUp} label="No trending posts yet" />;
  return (
    <ul className="space-y-3">
      {posts.map((p: any) => (
        <li key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{p.author?.displayName ?? 'User'}</p>
              <p className="text-[11px] text-gray-500">{new Date(p.createdAt).toLocaleString()}</p>
            </div>
            <span className="text-[11px] inline-flex items-center gap-1 text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
              <TrendingUp className="h-3 w-3" /> {p.likeCount + p.commentCount} engagement
            </span>
          </div>
          <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{p.body}</p>
          <p className="text-[11px] text-gray-500 mt-2">{p.likeCount} likes • {p.commentCount} comments • {p.saveCount} saves</p>
        </li>
      ))}
    </ul>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-32" />
      ))}
    </div>
  );
}

function Empty({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
      <Icon className="h-12 w-12 mx-auto mb-3 text-gray-200" />
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}
