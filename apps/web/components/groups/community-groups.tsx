'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Loader2, Mail, Search, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Pagination, QueryFailure } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { useJoinGroup, useLeaveGroup, useMyGroupInvites, useMyGroups, usePublicGroups, useRespondGroupInvite } from '@/hooks/use-groups';
import { plural } from '@/components/social/social-utils';

/**
 * Groups from a member's point of view (travelers included): invitations to
 * answer, the groups you belong to, and public groups you can join.
 */
export function CommunityGroups() {
  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
        <p className="mt-0.5 text-sm text-gray-600">Your trip groups, invitations from organizers, and public groups you can join.</p>
      </div>
      <Invitations />
      <MyGroups />
      <PublicGroups />
    </div>
  );
}

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Users2; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
        <Icon aria-hidden="true" className="h-4 w-4 text-brand-600" /> {title}
      </h2>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 py-4 text-sm text-gray-600">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Loading…
    </p>
  );
}

function Invitations() {
  const invites = useMyGroupInvites();
  const respond = useRespondGroupInvite();
  if (invites.error) return <QueryFailure error={invites.error} onRetry={() => invites.refetch()} />;
  if (invites.isLoading) return <Loading />;
  if (!invites.data?.length) return null;
  const answer = async (inviteId: string, accept: boolean, name: string) => {
    try {
      await respond.mutateAsync({ inviteId, accept });
      toast.success(accept ? `You joined ${name}` : 'Invitation declined');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The invitation could not be answered. Try again.'));
    }
  };
  return (
    <Section id="invites-title" title="Invitations" icon={Mail}>
      <ul className="space-y-2">
        {invites.data.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50/60 p-3">
            <div className="min-w-0 flex-1">
              <Link href={`/social/groups/${inv.group.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                {inv.group.name}
              </Link>
              <p className="text-xs text-gray-600">
                {inv.group.tripType ?? 'Group'} · invited {new Date(inv.createdAt).toLocaleDateString()}
              </p>
              {inv.message && <p className="mt-1 text-xs italic text-gray-600">&ldquo;{inv.message}&rdquo;</p>}
            </div>
            <div className="flex gap-1.5">
              <Button busy={respond.isPending && respond.variables?.inviteId === inv.id && respond.variables.accept} disabled={respond.isPending} onClick={() => answer(inv.id, true, inv.group.name)} className="px-3 py-1.5 text-xs">
                Accept
              </Button>
              <Button variant="secondary" disabled={respond.isPending} onClick={() => answer(inv.id, false, inv.group.name)} className="px-3 py-1.5 text-xs">
                Decline
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function MyGroups() {
  const mine = useMyGroups();
  const leave = useLeaveGroup();
  return (
    <Section id="mine-title" title="My groups" icon={Users2}>
      {mine.error ? (
        <QueryFailure error={mine.error} onRetry={() => mine.refetch()} />
      ) : mine.isLoading ? (
        <Loading />
      ) : !mine.data?.length ? (
        <p className="py-4 text-center text-sm text-gray-600">You are not in any group yet. Accept an invitation or join a public group below.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.data.map((g: any) => (
            <li key={g.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-4">
              <Link href={`/social/groups/${g.id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 hover:underline">{g.name}</p>
                <p className="text-xs text-gray-600">
                  {g.tripType ?? 'Group'} · {plural(g._count?.posts ?? 0, 'post')} · {String(g.membership?.role ?? 'member').toLowerCase()}
                </p>
                {g.departureDate && <p className="mt-1 text-xs text-gray-600">Departs {new Date(g.departureDate).toLocaleDateString()}</p>}
              </Link>
              {g.membership?.role !== 'OWNER' && (
                <Button
                  variant="quiet"
                  busy={leave.isPending && leave.variables === g.id}
                  onClick={async () => {
                    if (!window.confirm(`Leave ${g.name}?`)) return;
                    try {
                      await leave.mutateAsync(g.id);
                      toast.success(`You left ${g.name}`);
                    } catch (error) {
                      toast.error(apiErrorMessage(error, 'You could not leave this group. Try again.'));
                    }
                  }}
                  className="shrink-0 px-2 py-1 text-xs text-gray-600 hover:text-red-700"
                >
                  Leave
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PublicGroups() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const groups = usePublicGroups({ search: query || undefined, page, limit: 12 });
  const mine = useMyGroups();
  const join = useJoinGroup();
  const memberOf = new Set((mine.data ?? []).map((g: any) => g.id));
  const pages = Math.max(1, Math.ceil((groups.data?.total ?? 0) / 12));

  return (
    <Section id="public-title" title="Public groups" icon={Globe}>
      <div className="mb-3 flex w-full items-center gap-2 rounded-xl border border-gray-500 bg-white px-3 py-2 sm:w-72">
        <Search aria-hidden="true" className="h-4 w-4 text-gray-600" />
        <Input
          aria-label="Search public groups"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search groups…"
          className="min-h-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none"
        />
      </div>
      {groups.error ? (
        <QueryFailure error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.isLoading ? (
        <Loading />
      ) : !groups.data?.items.length ? (
        <p className="py-4 text-center text-sm text-gray-600">{query ? `No public groups match “${query}”.` : 'No public groups yet.'}</p>
      ) : (
        <>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {groups.data.items.map((g: any) => {
              const full = g.capacity > 0 && (g.enrolledCount ?? 0) >= g.capacity;
              return (
                <li key={g.id} className="flex flex-col rounded-xl border border-gray-200 p-4">
                  <Link href={`/social/groups/${g.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                    {g.name}
                  </Link>
                  <p className="text-xs text-gray-600">
                    {g.tripType ?? 'Group'} · {g.enrolledCount ?? 0}/{g.capacity ?? '—'} travelers
                  </p>
                  {g.description && <p className="mt-2 line-clamp-2 text-xs text-gray-600">{g.description}</p>}
                  <div className="mt-3 flex-1" />
                  {memberOf.has(g.id) ? (
                    <Link href={`/social/groups/${g.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                      Open group
                    </Link>
                  ) : full ? (
                    <span className="text-xs text-gray-600">This group is full</span>
                  ) : (
                    <Button
                      busy={join.isPending && join.variables === g.id}
                      disabled={join.isPending}
                      onClick={async () => {
                        try {
                          await join.mutateAsync(g.id);
                          toast.success(`You joined ${g.name}`);
                        } catch (error) {
                          toast.error(apiErrorMessage(error, 'You could not join this group.'));
                        }
                      }}
                      className="self-start px-3 py-1.5 text-xs"
                    >
                      Join
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <div className="mt-4">
              <Pagination page={page} pages={pages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </Section>
  );
}
