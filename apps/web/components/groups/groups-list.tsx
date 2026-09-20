'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, EyeOff, Globe, Loader2, Lock, Plus, RefreshCw, Search, Users2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Button, Input, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { apiErrorMessage } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useCreateGroup, useGroups, useGroupStats } from '@/hooks/use-groups';

/** The server's group statuses (GROUP_STATUS_VALUES) with display colours. */
export const GROUP_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  PLANNING: { label: 'Planning', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  IN_KSA: { label: 'In KSA', color: 'bg-saudi-500/10 text-saudi-600', dot: 'bg-saudi-500' },
  RETURNING: { label: 'Returning', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  COMPLETED: { label: 'Completed', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

const FILTERS = ['ALL', 'PLANNING', 'CONFIRMED', 'ACTIVE', 'IN_KSA', 'COMPLETED'];
const PAGE_SIZE = 20;

/** The organization's trip groups (CRM). Members' own view of their groups lives at /social/groups. */
export function GroupsList() {
  const { ready, can } = useCapabilities();
  const canRead = can('crm:pilgrim:read');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const groups = useGroups(
    { page, limit: PAGE_SIZE, search: query || undefined, status: statusFilter !== 'ALL' ? statusFilter : undefined },
    ready && canRead,
  );
  const stats = useGroupStats(ready && canRead);
  const createGroup = useCreateGroup();

  if (ready && !canRead) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Trip Groups</h1>
        <Alert tone="info" title="Your groups are in the Social Hub">
          <p>
            Groups you belong to, invitations and public groups are on{' '}
            <Link href="/social/groups" className="font-semibold underline">
              your groups page
            </Link>
            .
          </p>
        </Alert>
      </div>
    );
  }

  const items = groups.data?.items ?? [];
  const total = groups.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Groups</h1>
          <p className="mt-0.5 text-sm text-gray-600">{groups.isLoading ? 'Loading…' : `${total.toLocaleString()} groups`}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" aria-label="Refresh groups" onClick={() => groups.refetch()} className="rounded-xl border border-gray-200 p-2 text-gray-600 transition-colors hover:bg-gray-50">
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
          </Button>
          {can('crm:pilgrim:update') && (
            <Button
              variant="quiet"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              <Plus aria-hidden="true" className="h-4 w-4" /> New group
            </Button>
          )}
        </div>
      </div>

      {stats.error ? (
        <QueryFailure error={stats.error} onRetry={() => stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={stats.data?.total} label="Total groups" icon={<Users2 aria-hidden="true" className="h-3.5 w-3.5" />} tone="text-gray-600" />
          <StatTile value={stats.data?.active} label="Active groups" icon={<CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />} tone="text-green-800" />
          <StatTile value={stats.data?.completed} label="Completed" icon={<Clock aria-hidden="true" className="h-3.5 w-3.5" />} tone="text-blue-600" />
          <StatTile
            value={stats.data?.openIncidents ?? stats.data?.incidents}
            label="Open incidents"
            icon={<AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />}
            tone="text-red-700"
            alert={(stats.data?.openIncidents ?? 0) > 0}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex w-full items-center gap-2 rounded-xl border border-gray-500 bg-white px-3 py-2.5 transition-colors focus-within:border-brand-300 sm:w-72">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-600" />
          <Input
            aria-label="Search groups"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="min-h-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-gray-600"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              type="button"
              key={f}
              aria-pressed={statusFilter === f}
              onClick={() => {
                setStatusFilter(f);
                setPage(1);
              }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                statusFilter === f ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {f === 'ALL' ? 'All groups' : GROUP_STATUS[f]?.label ?? f}
            </button>
          ))}
        </div>
      </div>

      {groups.error ? (
        <QueryFailure error={groups.error} onRetry={() => groups.refetch()} />
      ) : groups.isLoading || !ready ? (
        <div aria-hidden="true" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border border-gray-200 bg-white" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-20 text-center">
          <Users2 aria-hidden="true" className="mx-auto mb-3 h-12 w-12 text-gray-200" />
          <p className="text-sm text-gray-600">{query || statusFilter !== 'ALL' ? 'No groups match these filters' : 'No groups yet'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((g: any) => {
            const cfg = GROUP_STATUS[g.status] ?? { label: g.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
            const memberCount = g.enrolledCount ?? 0;
            const occ = g.capacity > 0 ? Math.round((memberCount / g.capacity) * 100) : 0;
            const visibility = (g.visibility ?? 'PRIVATE').toUpperCase();
            const VisIcon = visibility === 'PUBLIC' ? Globe : visibility === 'UNLISTED' ? EyeOff : Lock;
            return (
              <Link key={g.id} href={`/groups/${g.id}`} className="block rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-200 hover:shadow-md">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Users2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{g.name}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <VisIcon aria-hidden="true" className="h-3 w-3" />
                          {visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
                        </span>
                        {g.tripType && <span>• {g.tripType}</span>}
                      </div>
                    </div>
                  </div>
                  {(g._count?.incidents ?? 0) > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
                      <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                      {g._count.incidents}
                    </span>
                  )}
                </div>
                <span className={cn('mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', cfg.color)}>
                  <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </span>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-gray-600">Capacity</span>
                    <span className="font-semibold text-gray-700">
                      {memberCount} / {g.capacity ?? '—'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className={cn('h-full rounded-full', occ >= 90 ? 'bg-red-400' : occ >= 70 ? 'bg-yellow-400' : 'bg-green-400')} style={{ width: `${Math.min(occ, 100)}%` }} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-50 pt-3 text-xs text-gray-600">
                  <span className="text-center">
                    <span className="font-semibold text-gray-700">{g._count?.posts ?? 0}</span> Posts
                  </span>
                  <span className="text-center">
                    <span className="font-semibold text-gray-700">{g._count?.notes ?? 0}</span> Notes
                  </span>
                  <span className="text-center">
                    <span className="font-semibold text-gray-700">{g._count?.polls ?? 0}</span> Polls
                  </span>
                </div>
                {(g.departureDate || g.returnDate) && (
                  <div className="mt-3 flex items-center gap-3 border-t border-gray-50 pt-3 text-xs text-gray-600">
                    {g.departureDate && <span>Depart: {new Date(g.departureDate).toLocaleDateString()}</span>}
                    {g.returnDate && <span>Return: {new Date(g.returnDate).toLocaleDateString()}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button variant="secondary" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs">
              Previous
            </Button>
            <Button variant="secondary" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 text-xs">
              Next
            </Button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          pending={createGroup.isPending}
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createGroup.mutateAsync(dto);
              toast.success('Group created');
              setShowCreate(false);
            } catch (e) {
              toast.error(apiErrorMessage(e, 'The group could not be created.'));
            }
          }}
        />
      )}
    </div>
  );
}

function StatTile({ value, label, icon, tone, alert }: { value?: number; label: string; icon: React.ReactNode; tone: string; alert?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className={cn('text-2xl font-bold', alert ? 'text-red-600' : 'text-gray-900')}>{value ?? '—'}</p>
      <div className={cn('mt-1 inline-flex items-center gap-1.5 text-xs font-medium', tone)}>
        {icon} {label}
      </div>
    </div>
  );
}

function CreateGroupModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: Record<string, any>) => Promise<void>; pending: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tripType, setTripType] = useState<'UMRAH' | 'HAJJ'>('UMRAH');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'UNLISTED'>('PRIVATE');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [notes, setNotes] = useState('');
  const capacity = maxCapacity ? Number(maxCapacity) : undefined;
  const invalidCapacity = capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1);
  const invalidDates = !!departureDate && !!returnDate && returnDate < departureDate;

  const submit = async () => {
    if (!name.trim() || invalidCapacity || invalidDates) return;
    await onCreate({
      name: name.trim(),
      description: description || undefined,
      tripType,
      visibility,
      departureDate: departureDate ? new Date(departureDate).toISOString() : undefined,
      returnDate: returnDate ? new Date(returnDate).toISOString() : undefined,
      maxCapacity: capacity,
      notes: notes || undefined,
    });
  };

  return (
    <ModalSurface title="New group" onClose={onClose} busy={pending}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">New group</h2>
          <Button variant="quiet" aria-label="Close dialog" onClick={onClose} disabled={pending} className="rounded-lg p-1.5 hover:bg-gray-100">
            <X aria-hidden="true" className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Group name *</span>
            <Input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Ramadan 2026 — Group A" className="w-full text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Trip type</span>
              <Select value={tripType} onChange={(e) => setTripType(e.target.value as any)} className="w-full text-sm">
                <option value="UMRAH">Umrah</option>
                <option value="HAJJ">Hajj</option>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Visibility</span>
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className="w-full text-sm">
                <option value="PRIVATE">Private — invited members only</option>
                <option value="UNLISTED">Unlisted — anyone with the link can join</option>
                <option value="PUBLIC">Public — listed and open to join</option>
              </Select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Description</span>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Shown to members on the group page" className="w-full resize-none text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Departure</span>
              <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} className="w-full text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Return</span>
              <Input type="date" value={returnDate} min={departureDate || undefined} onChange={(e) => setReturnDate(e.target.value)} className="w-full text-sm" />
            </label>
          </div>
          {invalidDates && <p className="text-xs text-red-700">The return date must be on or after the departure date.</p>}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Capacity (travelers)</span>
            <Input type="number" min="1" step="1" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="40" className="w-full text-sm" />
          </label>
          {invalidCapacity && <p className="text-xs text-red-700">Capacity must be a whole number of at least 1.</p>}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Briefing notes (visible to your organization only)</span>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal briefing notes…" className="w-full resize-none text-sm" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} busy={pending} disabled={!name.trim() || invalidCapacity || invalidDates}>
            {!pending && <Plus aria-hidden="true" className="h-4 w-4" />} Create group
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}

export function GroupsLoading() {
  return (
    <p role="status" className="flex items-center justify-center py-20 text-sm text-gray-600">
      <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" /> Loading…
    </p>
  );
}
