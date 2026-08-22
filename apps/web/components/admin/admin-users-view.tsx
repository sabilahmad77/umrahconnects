'use client';

import { useState } from 'react';
import {
  Users, RefreshCw, Loader2, AlertCircle, Search, LogOut, Download,
  CheckCircle2, Lock, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAdminUsers, useSetUserStatus, useForceLogout, useAssignUserRole,
  useRemoveUserRole, useAdminRoles, useAdminTenants, useAdminExport,
} from '@/hooks/use-admin';
import { USER_STATUSES, USER_STATUS_META } from '@/lib/statuses';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';

const FILTERS = ['ALL', ...USER_STATUSES] as const;
const PAGE_SIZE = 20;

const apiError = (e: any) =>
  e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Action failed';

export function AdminUsersView() {
  const [status, setStatus] = useState<string>('ALL');
  const [tenantId, setTenantId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const params = {
    status: status !== 'ALL' ? status : undefined,
    tenantId: tenantId || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, error, refetch } = useAdminUsers(params);
  const { data: roles = [] } = useAdminRoles();
  const { data: tenantsData } = useAdminTenants({ limit: 200 });
  const setUserStatus = useSetUserStatus();
  const forceLogout = useForceLogout();
  const assignRole = useAssignUserRole();
  const removeRole = useRemoveUserRole();
  const exportCsv = useAdminExport();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const tenants = tenantsData?.items ?? [];

  const counts = (s: string) => items.filter((u: any) => u.status === s).length;
  const tiles = [
    { label: 'Total users', value: total,                          color: 'text-gray-700',   Icon: Users },
    { label: 'Active',      value: counts('ACTIVE'),               color: 'text-green-600',  Icon: CheckCircle2 },
    { label: 'Locked',      value: counts('LOCKED'),               color: 'text-red-500',    Icon: Lock },
    { label: 'Pending',     value: counts('PENDING_VERIFICATION'), color: 'text-yellow-600', Icon: Clock },
  ];

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  const nameOf = (u: any) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id.slice(0, 8);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} users across all tenants</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => run(() => exportCsv.mutateAsync({ kind: 'users', params }), 'Users exported')}
            disabled={exportCsv.isPending}
            className="inline-flex items-center gap-2 text-sm px-3.5 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 disabled:opacity-50"
          >
            {exportCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </button>
          <button onClick={() => refetch()} aria-label="Refresh users" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{Number(t.value).toLocaleString()}</p>
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', t.color)}>
              <t.Icon className="h-3.5 w-3.5" /> {t.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full lg:w-72 focus-within:border-brand-300">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search users"
            placeholder="Search email / name…"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
          />
        </div>
        <select
          value={tenantId}
          aria-label="Filter by tenant"
          onChange={(e) => { setTenantId(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2.5 border border-gray-200 rounded-xl bg-white outline-none"
        >
          <option value="">All tenants</option>
          {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
            >
              {s === 'ALL' ? 'All' : USER_STATUS_META[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500 mb-2">Failed to load users</p>
          <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center px-6">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-700">No users match this view</p>
          <p className="text-xs text-gray-500 mt-1">Clear the search, or widen the tenant and status filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left p-3">User</th>
                  <th className="text-left p-3">Tenant</th>
                  <th className="text-left p-3">Roles</th>
                  <th className="text-left p-3">Last login</th>
                  <th className="text-left p-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((u: any) => {
                  const meta = USER_STATUS_META[u.status] ?? { label: u.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  const grantable = roles.filter((r: any) =>
                    !(u.roles ?? []).some((ur: any) => ur.id === r.id) &&
                    (!r.tenantId || r.tenantId === u.tenantId));
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60">
                      <td className="p-3">
                        <p className="font-medium text-gray-900">{nameOf(u)}</p>
                        <p className="text-[11px] text-gray-500">{u.email ?? u.phone ?? '—'}</p>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{u.tenant?.name ?? '—'}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(u.roles ?? []).map((r: any) => (
                            <span key={r.id} className="inline-flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                              {r.name}
                              <button
                                aria-label={`Revoke ${r.name} from ${nameOf(u)}`}
                                onClick={() => setConfirm({
                                  title: `Revoke “${r.name}”?`,
                                  body: `${nameOf(u)} loses every permission that role grants, on their next request.`,
                                  cta: 'Revoke role',
                                  tone: 'danger',
                                  onConfirm: () => run(
                                    () => removeRole.mutateAsync({ userId: u.id, roleId: r.id }),
                                    `${r.name} revoked`),
                                })}
                                className="hover:text-red-600"
                              >×</button>
                            </span>
                          ))}
                          <select
                            value=""
                            aria-label={`Grant a role to ${nameOf(u)}`}
                            onChange={(e) => {
                              const roleId = e.target.value;
                              if (!roleId) return;
                              const role = roles.find((r: any) => r.id === roleId);
                              setConfirm({
                                title: `Grant “${role?.name}”?`,
                                body: `${nameOf(u)} immediately gains every permission attached to this role.`,
                                cta: 'Grant role',
                                onConfirm: () => run(
                                  () => assignRole.mutateAsync({ userId: u.id, roleId }),
                                  `${role?.name} granted`),
                              });
                            }}
                            className="text-[10px] border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white"
                          >
                            <option value="">+ Add role</option>
                            {grantable.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full font-medium', meta.color)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
                          </span>
                          <select
                            value={u.status}
                            aria-label={`Status for ${nameOf(u)}`}
                            onChange={(e) => {
                              const next = e.target.value;
                              const blocking = next === 'LOCKED' || next === 'INACTIVE';
                              setConfirm({
                                title: `Set ${nameOf(u)} to ${USER_STATUS_META[next]?.label ?? next}?`,
                                body: blocking
                                  ? `${nameOf(u)} will not be able to sign in until the account is set back to Active.`
                                  : `${nameOf(u)} can sign in again.`,
                                cta: 'Change status',
                                tone: blocking ? 'danger' : 'default',
                                onConfirm: () => run(
                                  () => setUserStatus.mutateAsync({ id: u.id, status: next }),
                                  `${nameOf(u)} → ${USER_STATUS_META[next]?.label ?? next}`),
                              });
                            }}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          >
                            {USER_STATUSES.map((s) => <option key={s} value={s}>{USER_STATUS_META[s].label}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => setConfirm({
                            title: `Revoke sessions for ${nameOf(u)}?`,
                            body: `Every device signed in as ${nameOf(u)} is signed out. They can sign in again straight away unless the account is also locked.`,
                            cta: 'Revoke sessions',
                            tone: 'danger',
                            onConfirm: async () => {
                              try {
                                const res: any = await forceLogout.mutateAsync(u.id);
                                toast.success(`${res?.sessionsRevoked ?? 0} session(s) revoked`);
                                refetch();
                              } catch (e: any) { toast.error(apiError(e)); }
                            },
                          })}
                          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 hover:underline"
                        >
                          <LogOut className="h-3 w-3" /> Force logout
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total} users</p>
              <div className="flex gap-1.5">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
