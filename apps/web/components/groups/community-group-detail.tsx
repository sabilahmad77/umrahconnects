'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, EyeOff, Globe, Loader2, Lock, MessageSquare, Settings, Users2, Vote } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, QueryFailure } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useGroup, useJoinGroup, useLeaveGroup, useRespondGroupInvite } from '@/hooks/use-groups';
import { GroupDiscussion } from './group-discussion';
import { GroupPolls } from './group-polls';

const VISIBILITY = {
  PUBLIC: { label: 'Public', Icon: Globe },
  UNLISTED: { label: 'Unlisted', Icon: EyeOff },
  PRIVATE: { label: 'Private', Icon: Lock },
} as const;

/**
 * A trip group as its members (travelers) see it: public-safe details, the
 * discussion and polls, and the actions open to the viewer — accept or decline
 * an invitation, join a public/unlisted group, leave. The organization's
 * management tools live on /groups/[id].
 */
export function CommunityGroupDetail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useCapabilities();
  const group = useGroup(id);
  const join = useJoinGroup();
  const leave = useLeaveGroup();
  const respond = useRespondGroupInvite();
  const [tab, setTab] = useState<'discussion' | 'polls'>('discussion');

  const status = (group.error as any)?.response?.status;
  if (group.isLoading) {
    return (
      <p role="status" className="flex items-center justify-center py-20 text-sm text-gray-600">
        <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" /> Loading group…
      </p>
    );
  }
  if (status === 404 || status === 400) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert title="This group is not available">It is private and you are not a member, or it no longer exists.</Alert>
      </div>
    );
  }
  if (group.error || !group.data) return <QueryFailure error={group.error} onRetry={() => group.refetch()} />;

  const g = group.data;
  const viewer = g.viewer ?? {};
  const isMember = !!viewer.membership;
  const manages = !!viewer.canManage && can('crm:pilgrim:update');
  const canSeeContent = isMember || viewer.canRead;
  const vis = VISIBILITY[(g.visibility ?? 'PRIVATE') as keyof typeof VISIBILITY] ?? VISIBILITY.PRIVATE;
  const members = g.enrolledCount ?? g._count?.members ?? 0;

  const act = async (action: () => Promise<unknown>, success: string, fallback: string) => {
    try {
      await action();
      toast.success(success);
      await group.refetch();
    } catch (error) {
      toast.error(apiErrorMessage(error, fallback));
    }
  };

  return (
    <div className="space-y-5 pb-10">
      <BackLink />
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{g.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                <vis.Icon aria-hidden="true" className="h-3 w-3" /> {vis.label}
              </span>
              {g.tripType && <span className="rounded-full bg-saudi-50 px-2 py-1 text-xs font-medium text-saudi-700">{g.tripType}</span>}
              {isMember && <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">You are a {String(viewer.membership.role).toLowerCase()}</span>}
            </div>
            {g.description && <p className="mt-2 max-w-2xl text-sm text-gray-600">{g.description}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1">
                <Users2 aria-hidden="true" className="h-3.5 w-3.5" /> {members} / {g.capacity ?? '—'} travelers
              </span>
              {(g.departureDate || g.returnDate) && (
                <span className="inline-flex items-center gap-1">
                  <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
                  {g.departureDate ? new Date(g.departureDate).toLocaleDateString() : 'To be confirmed'} –{' '}
                  {g.returnDate ? new Date(g.returnDate).toLocaleDateString() : 'To be confirmed'}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {manages && (
              <Link href={`/groups/${g.id}`} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <Settings aria-hidden="true" className="h-4 w-4" /> Manage group
              </Link>
            )}
            {!isMember && viewer.canJoin && !viewer.pendingInvite && (
              <Button busy={join.isPending} onClick={() => act(() => join.mutateAsync(g.id), `You joined ${g.name}`, 'You could not join this group.')}>
                Join group
              </Button>
            )}
            {isMember && viewer.membership.role !== 'OWNER' && (
              <Button
                variant="secondary"
                busy={leave.isPending}
                onClick={async () => {
                  if (!window.confirm(`Leave ${g.name}? You will no longer see its discussion.`)) return;
                  try {
                    await leave.mutateAsync(g.id);
                    toast.success(`You left ${g.name}`);
                    router.push('/social/groups');
                  } catch (error) {
                    toast.error(apiErrorMessage(error, 'You could not leave this group. Try again.'));
                  }
                }}
              >
                Leave group
              </Button>
            )}
          </div>
        </div>
      </div>

      {viewer.pendingInvite && (
        <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
          <p className="font-semibold">You are invited to join this group.</p>
          {viewer.pendingInvite.message && <p className="mt-1">&ldquo;{viewer.pendingInvite.message}&rdquo;</p>}
          <div className="mt-3 flex gap-2">
            <Button
              busy={respond.isPending && respond.variables?.accept === true}
              disabled={respond.isPending}
              onClick={() => act(() => respond.mutateAsync({ inviteId: viewer.pendingInvite.id, accept: true }), `Welcome to ${g.name}`, 'The invitation could not be accepted.')}
            >
              Accept invitation
            </Button>
            <Button
              variant="secondary"
              busy={respond.isPending && respond.variables?.accept === false}
              disabled={respond.isPending}
              onClick={async () => {
                try {
                  await respond.mutateAsync({ inviteId: viewer.pendingInvite.id, accept: false });
                  toast.success('Invitation declined');
                  router.push('/social/groups');
                } catch (error) {
                  toast.error(apiErrorMessage(error, 'The invitation could not be declined.'));
                }
              }}
            >
              Decline
            </Button>
          </div>
        </div>
      )}

      {canSeeContent ? (
        <>
          <div role="tablist" {...tablistKeys()} aria-label="Group sections" className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1.5">
            {[
              { key: 'discussion' as const, label: 'Discussion', Icon: MessageSquare },
              { key: 'polls' as const, label: 'Polls', Icon: Vote },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  tab === t.key ? 'border border-brand-100 bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                <t.Icon aria-hidden="true" className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </div>
          {tab === 'discussion' ? (
            <GroupDiscussion groupId={g.id} canPost={isMember || manages} canPin={manages} />
          ) : (
            <GroupPolls groupId={g.id} canCreate={manages} />
          )}
        </>
      ) : (
        !viewer.pendingInvite && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-600">
            Join this group to take part in its discussion and polls.
          </p>
        )
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/social/groups" className="inline-flex items-center gap-2 text-sm font-medium text-brand-700">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> All my groups
    </Link>
  );
}
