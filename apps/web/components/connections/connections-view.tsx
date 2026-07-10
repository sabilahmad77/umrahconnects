'use client';

import { Users, UserPlus, Check, X, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useConnections, usePendingConnections, useAcceptConnection, useRejectConnection } from '@/hooks/use-platform';
import { cn } from '@/lib/utils';

export function ConnectionsView() {
  const accepted = useConnections();
  const pending = usePendingConnections();
  const acceptM = useAcceptConnection();
  const rejectM = useRejectConnection();

  const connected: any[] = accepted.data?.items ?? [];
  const requests: any[] = pending.data?.items ?? [];

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your network — only connected people can be added to private trip groups.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Connections" value={connected.length} tint="text-blue-700" />
        <Stat label="Pending requests" value={requests.length} tint="text-yellow-700" />
        <Stat label="New this week" value={connected.filter((c) => c.since && (Date.now() - new Date(c.since).getTime()) < 7 * 24 * 3600 * 1000).length} tint="text-saudi-700" />
      </div>

      {/* Pending */}
      {requests.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brand-600" /> Pending requests
          </h2>
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.connectionId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <Avatar name={r.displayName ?? r.email ?? '??'} url={r.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{r.displayName ?? '—'}</p>
                  <p className="text-xs text-gray-500">{r.email}</p>
                  {r.message && <p className="text-xs text-gray-600 mt-1 italic">"{r.message}"</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={async () => { try { await acceptM.mutateAsync(r.connectionId); toast.success('Connected'); } catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Failed'); } }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-saudi-500 text-white rounded-lg hover:bg-saudi-600"
                  >
                    <Check className="h-3 w-3" /> Accept
                  </button>
                  <button
                    onClick={async () => { try { await rejectM.mutateAsync(r.connectionId); toast('Request rejected'); } catch (e: any) { toast.error('Failed'); } }}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accepted */}
      <section className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" /> My connections
        </h2>
        {accepted.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
          </div>
        ) : connected.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-8">No connections yet — discover and connect with people from the Social Hub.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {connected.map((c) => (
              <div key={c.connectionId} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
                <Avatar name={c.displayName ?? c.email ?? '??'} url={c.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.displayName ?? '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{c.email}</p>
                </div>
                <button
                  className="p-1.5 text-gray-500 hover:text-brand-500 hover:bg-brand-50 rounded-lg"
                  title="Message"
                >
                  <Mail className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: number | string; tint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className={cn('text-2xl font-bold', tint)}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  const initials = name.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  if (url) {
    return <img src={url} alt={name} className="w-10 h-10 rounded-xl object-cover" />;
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {initials}
    </div>
  );
}
