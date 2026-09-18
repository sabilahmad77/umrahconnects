'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Clock, MessageSquare, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, Button, QueryFailure } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import {
  useAcceptConnection,
  useConnections,
  useOpenConversation,
  useOutgoingConnections,
  usePendingConnections,
  useRejectConnection,
  useRemoveConnection,
} from '@/hooks/use-platform';

export function ConnectionsView() {
  const router = useRouter();
  const accepted = useConnections();
  const pending = usePendingConnections();
  const outgoing = useOutgoingConnections();
  const acceptM = useAcceptConnection();
  const rejectM = useRejectConnection();
  const removeM = useRemoveConnection();
  const openConversation = useOpenConversation();
  const [busy, setBusy] = useState<string | null>(null);

  const connected = accepted.data?.items ?? [];
  const requests = pending.data?.items ?? [];
  const sent = outgoing.data?.items ?? [];

  const run = async (key: string, action: () => Promise<unknown>, success: string | null, fallback: string) => {
    setBusy(key);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(apiErrorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
          <p className="mt-0.5 text-sm text-gray-600">People you are connected with, and requests waiting for an answer.</p>
        </div>
        <Link href="/discover" className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white shadow-sm hover:bg-brand-600">
          <UserPlus aria-hidden="true" className="h-4 w-4" /> Find people
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Connections" value={accepted.isLoading ? undefined : connected.length} tint="text-blue-700" />
        <Stat label="Requests for you" value={pending.isLoading ? undefined : requests.length} tint="text-yellow-700" />
        <Stat label="Requests you sent" value={outgoing.isLoading ? undefined : sent.length} tint="text-saudi-700" />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="incoming-title">
        <h2 id="incoming-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
          <UserPlus aria-hidden="true" className="h-4 w-4 text-brand-600" /> Requests for you
        </h2>
        {pending.error ? (
          <QueryFailure error={pending.error} onRetry={() => pending.refetch()} />
        ) : pending.isLoading ? (
          <ListSkeleton />
        ) : requests.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-600">No requests waiting for you.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.connectionId} className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
                <Avatar name={r.displayName ?? 'Member'} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{r.displayName ?? 'Member'}</p>
                  {r.email && <p className="text-xs text-gray-600">{r.email}</p>}
                  {r.message && <p className="mt-1 text-xs italic text-gray-600">&ldquo;{r.message}&rdquo;</p>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="quiet"
                    busy={busy === `accept:${r.connectionId}`}
                    onClick={() => run(`accept:${r.connectionId}`, () => acceptM.mutateAsync(r.connectionId), `You are now connected with ${r.displayName ?? 'this member'}`, 'The request could not be accepted. Try again.')}
                    className="flex items-center gap-1 rounded-lg bg-saudi-500 px-3 py-1.5 text-xs text-white hover:bg-saudi-600"
                  >
                    <Check aria-hidden="true" className="h-3 w-3" /> Accept
                  </Button>
                  <Button
                    variant="quiet"
                    busy={busy === `reject:${r.connectionId}`}
                    aria-label={`Decline the request from ${r.displayName ?? 'this member'}`}
                    onClick={() => run(`reject:${r.connectionId}`, () => rejectM.mutateAsync(r.connectionId), 'Request declined', 'The request could not be declined. Try again.')}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-white"
                  >
                    <X aria-hidden="true" className="h-3 w-3" /> Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="connected-title">
        <h2 id="connected-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
          <Users aria-hidden="true" className="h-4 w-4 text-blue-600" /> My connections
        </h2>
        {accepted.error ? (
          <QueryFailure error={accepted.error} onRetry={() => accepted.refetch()} />
        ) : accepted.isLoading ? (
          <ListSkeleton />
        ) : connected.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-600">No connections yet — find people in Discover and send a request.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {connected.map((c) => (
              <li key={c.connectionId} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                <Avatar name={c.displayName ?? 'Member'} url={c.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{c.displayName ?? 'Member'}</p>
                  <p className="truncate text-xs text-gray-600">{c.email ?? (c.since ? `Connected ${new Date(c.since).toLocaleDateString()}` : 'Connected')}</p>
                </div>
                <Button
                  variant="quiet"
                  busy={busy === `dm:${c.otherUserId}`}
                  aria-label={`Message ${c.displayName ?? 'this connection'}`}
                  title="Message"
                  onClick={() =>
                    run(
                      `dm:${c.otherUserId}`,
                      async () => {
                        const conv = await openConversation.mutateAsync(c.otherUserId);
                        router.push(`/messages?c=${conv.id}`);
                      },
                      null,
                      'The conversation could not be opened. Try again.',
                    )
                  }
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-brand-50 hover:text-brand-500"
                >
                  {busy !== `dm:${c.otherUserId}` && <MessageSquare aria-hidden="true" className="h-4 w-4" />}
                </Button>
                <Button
                  variant="quiet"
                  busy={busy === `remove:${c.otherUserId}`}
                  aria-label={`Remove ${c.displayName ?? 'this connection'}`}
                  title="Remove connection"
                  onClick={() => {
                    if (!window.confirm(`Remove ${c.displayName ?? 'this person'} from your connections?`)) return;
                    run(`remove:${c.otherUserId}`, () => removeM.mutateAsync(c.otherUserId), 'Connection removed', 'The connection could not be removed. Try again.');
                  }}
                  className="rounded-lg p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-700"
                >
                  {busy !== `remove:${c.otherUserId}` && <UserMinus aria-hidden="true" className="h-4 w-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5" aria-labelledby="sent-title">
        <h2 id="sent-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
          <Clock aria-hidden="true" className="h-4 w-4 text-saudi-600" /> Requests you sent
        </h2>
        {outgoing.error ? (
          <QueryFailure error={outgoing.error} onRetry={() => outgoing.refetch()} />
        ) : outgoing.isLoading ? (
          <ListSkeleton />
        ) : sent.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-600">No requests waiting for an answer.</p>
        ) : (
          <ul className="space-y-2">
            {sent.map((r) => (
              <li key={r.connectionId} className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-3">
                <Avatar name={r.displayName ?? 'Member'} url={r.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{r.displayName ?? 'Member'}</p>
                  <p className="text-xs text-gray-600">Sent {new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="quiet"
                  busy={busy === `withdraw:${r.recipientId}`}
                  onClick={() => run(`withdraw:${r.recipientId}`, () => removeM.mutateAsync(r.recipientId), 'Request withdrawn', 'The request could not be withdrawn. Try again.')}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-white"
                >
                  Withdraw
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-50" />
      ))}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value?: number; tint: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className={cn('text-2xl font-bold', tint)}>{value ?? '—'}</p>
      <p className="mt-1 text-xs text-gray-600">{label}</p>
    </div>
  );
}
