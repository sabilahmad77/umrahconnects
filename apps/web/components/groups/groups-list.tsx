'use client';
import { Input, ModalSurface, Select, Textarea , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import Link from 'next/link';
import {
  Users2, Plus, RefreshCw, Search, AlertTriangle,
  CheckCircle2, Clock, AlertCircle, MapPin, X, Loader2, Globe, Lock, EyeOff,
} from 'lucide-react';
import { useGroups, useGroupStats, useCreateGroup, usePublicGroups, useJoinGroup } from '@/hooks/use-api';
import { useAuthContext } from '@/components/providers/auth-provider';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const GROUP_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  PLANNED:    { label: 'Planned',   color: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  ACTIVE:     { label: 'Active',    color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  IN_KSA:     { label: 'In KSA',    color: 'bg-saudi-500/10 text-saudi-600', dot: 'bg-saudi-500' },
  RETURNING:  { label: 'Returning', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  COMPLETED:  { label: 'Completed', color: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
  CANCELLED:  { label: 'Cancelled', color: 'bg-red-100 text-red-600',    dot: 'bg-red-500' },
};

const FILTERS = ['ALL', 'ACTIVE', 'PLANNED', 'IN_KSA', 'COMPLETED'];

export function GroupsList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  // Travelers browse PUBLIC groups (cross-tenant, joinable);
  // operator roles manage their tenant's own groups.
  const { user } = useAuthContext();
  const isTraveler = user?.dashboardType === 'pilgrim';

  const tenantGroups = useGroups({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });
  const publicGroups = usePublicGroups({ search: search || undefined });
  const { data, isLoading, error, refetch } = isTraveler ? (publicGroups as any) : tenantGroups;
  const joinGroup = useJoinGroup();
  const { data: stats , error: groupStatsError, refetch: retryGroupStats} = useGroupStats();
  const createGroup = useCreateGroup();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  if (groupStatsError) return <QueryFailure error={groupStatsError} onRetry={() => { retryGroupStats(); }} />;
  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trip Groups</h1>
          <p className="text-sm text-gray-600 mt-0.5">{total.toLocaleString()} groups total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="quiet" type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Group
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 mt-1">
              <Users2 className="h-3.5 w-3.5" /> Total Groups
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-green-800 mt-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Active Groups
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 mt-1">
              <Clock className="h-3.5 w-3.5" /> Completed
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className={cn('text-2xl font-bold', stats.incidents > 0 ? 'text-red-600' : 'text-gray-900')}>
              {stats.incidents}
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 mt-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Incidents
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-600 shrink-0" />
          <Input aria-label="Search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search groups..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-600"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <Button variant="quiet" type="button"
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                statusFilter === f
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300',
              )}
            >
              {f === 'ALL' ? 'All Groups' : GROUP_STATUS[f]?.label ?? f}
            </Button>
          ))}
        </div>
      </div>

      {/* Group cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
          <Users2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No groups found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((g: any) => {
            const cfg = GROUP_STATUS[g.status] ?? { label: g.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
            const memberCount = g.enrolledCount ?? g._count?.members ?? 0;
            const occ = g.capacity > 0 ? Math.round((memberCount / g.capacity) * 100) : 0;
            const hasIncidents = (g._count?.incidents ?? 0) > 0;
            const visibility = (g.visibility ?? 'PRIVATE').toUpperCase();
            const VisIcon = visibility === 'PUBLIC' ? Globe : visibility === 'UNLISTED' ? EyeOff : Lock;
            return (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                      <Users2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <VisIcon className="h-3 w-3" />
                          {visibility === 'PUBLIC' ? 'Public' : visibility === 'UNLISTED' ? 'Unlisted' : 'Private'}
                        </span>
                        {g.tripType && <span>• {g.tripType}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {hasIncidents && (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        {g._count.incidents}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge + traveler join action */}
                <div className="flex items-center justify-between mb-3">
                  <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                    {cfg.label}
                  </span>
                  {isTraveler && visibility === 'PUBLIC' && (
                    <Button variant="quiet" type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        try { await joinGroup.mutateAsync(g.id); toast.success(`Joined ${g.name}`); }
                        catch (err: any) { toast.error(err?.response?.data?.error?.message ?? 'Could not join'); }
                      }}
                      disabled={joinGroup.isPending}
                      className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      Join
                    </Button>
                  )}
                </div>

                {/* Capacity bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-600">Capacity</span>
                    <span className="font-semibold text-gray-700">
                      {memberCount} / {g.capacity ?? '—'}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', occ >= 90 ? 'bg-red-400' : occ >= 70 ? 'bg-yellow-400' : 'bg-green-400')}
                      style={{ width: `${Math.min(occ, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{occ}% filled</p>
                </div>

                {/* Mini activity tiles */}
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-600">
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

                {/* Dates */}
                {(g.departureDate || g.returnDate) && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50 text-xs text-gray-600">
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
          <p className="text-xs text-gray-600">Page {page} of {totalPages}</p>
          <div className="flex gap-1.5">
            <Button variant="quiet" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Prev</Button>
            <Button variant="quiet" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">Next</Button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createGroup.mutateAsync(dto);
              toast.success('Group created');
              setShowCreate(false);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to create group');
            }
          }}
          pending={createGroup.isPending}
        />
      )}
    </div>
  );
}

// ─── Create Group Modal ─────────────────────────────────────────────────────
function CreateGroupModal({
  onClose, onCreate, pending,
}: {
  onClose: () => void;
  onCreate: (dto: Record<string, any>) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tripType, setTripType] = useState<'UMRAH' | 'HAJJ'>('UMRAH');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC' | 'UNLISTED'>('PRIVATE');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [maxCapacity, setMaxCapacity] = useState<string>('');
  const [notes, setNotes] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    await onCreate({
      name: name.trim(),
      description: description || undefined,
      tripType,
      visibility,
      departureDate: departureDate ? new Date(departureDate).toISOString() : undefined,
      returnDate: returnDate ? new Date(returnDate).toISOString() : undefined,
      maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <ModalSurface title="New group" onClose={onClose}   >
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New group</h2>
          <Button variant="quiet" type="button" aria-label="Close dialog" onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-600" />
          </Button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Group name *</span>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramadan 2026 — Group A"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Trip type</span>
              <Select
                value={tripType}
                onChange={(e) => setTripType(e.target.value as any)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 outline-none bg-white"
              >
                <option value="UMRAH">Umrah</option>
                <option value="HAJJ">Hajj</option>
              </Select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Visibility</span>
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 outline-none bg-white"
              >
                <option value="PRIVATE">Private — only invited members</option>
                <option value="UNLISTED">Unlisted — link-only</option>
                <option value="PUBLIC">Public — discoverable</option>
              </Select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Description</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description shown on the group page"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Departure</span>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Return</span>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Capacity</span>
            <Input
              type="number"
              min="1"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value)}
              placeholder="50"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Operator notes</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal briefing notes…"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none resize-none"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="quiet" type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </Button>
          <Button variant="quiet" type="button"
            onClick={submit}
            disabled={pending || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create group
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
