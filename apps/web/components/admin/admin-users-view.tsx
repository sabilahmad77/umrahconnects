'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input, Select , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import {
  Users, RefreshCw, Loader2, AlertCircle, Search, LogOut, Download,
  CheckCircle2, Lock, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAdminUsers, useSetUserStatus, useForceLogout, useAssignUserRole,
  useRemoveUserRole, useAdminTenants, useAdminExport, useAdminStats } from '@/hooks/use-admin';
import { useAuthContext } from '@/components/providers/auth-provider';
import { USER_STATUSES, USER_STATUS_META } from '@/lib/statuses';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';

const FILTERS = ['ALL', ...USER_STATUSES] as const;
const PAGE_SIZE = 20;

/** Uses the shared helper so validation arrays render as a sentence. */
const apiError = (e: any) => apiErrorMessage(e, 'Action failed');

export function AdminUsersView() {
  const { user } = useAuthContext();
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
  const { data: tenantsData , error: adminTenantsError, refetch: retryAdminTenants} = useAdminTenants({ limit: 200 });
  const setUserStatus = useSetUserStatus();
  const forceLogout = useForceLogout();
  const assignRole = useAssignUserRole();
  const removeRole = useRemoveUserRole();
  const exportCsv = useAdminExport();

  const { data: stats } = useAdminStats();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const tenants = tenantsData?.items ?? [];

  // Platform-wide counts from /admin/stats, for the same reason as the tenants
  // tiles: a page-scoped count next to a platform-wide total misleads.
  const byStatus: Record<string, number> = stats?.usersByStatus ?? {};
  const tiles = [
    { label: 'Total users', value: total,                                color: 'text-gray-700',   Icon: Users },
    { label: 'Active',      value: byStatus.ACTIVE ?? 0,                 color: 'text-green-800',  Icon: CheckCircle2 },
    { label: 'Locked',      value: byStatus.LOCKED ?? 0,                 color: 'text-red-700',    Icon: Lock },
    { label: 'Pending',     value: byStatus.PENDING_VERIFICATION ?? 0,   color: 'text-yellow-800', Icon: Clock },
  ];

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  const nameOf = (u: any) => `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id.slice(0, 8);

  if (error || adminTenantsError) return <QueryFailure error={error || adminTenantsError} onRetry={() => { refetch(); retryAdminTenants(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All users</h1>
          <p className="text-sm text-gray-600 mt-0.5">{total.toLocaleString()} users across all tenants</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button"
            onClick={() => run(() => exportCsv.mutateAsync({ kind: 'users', params }), 'Users exported')}
            disabled={exportCsv.isPending}
            className="inline-flex items-center gap-2 text-sm px-3.5 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 disabled:opacity-50"
          >
            {exportCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </Button>
          <Button variant="quiet" type="button" onClick={() => refetch()} aria-label="Refresh users" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{Number(t.value).toLocaleString()}</p>
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', t.color)}>
              <t.Icon className="h-3.5 w-3.5" /> {t.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full lg:w-72 focus-within:border-brand-300">
          <Search className="h-4 w-4 text-gray-600" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search"
            placeholder="Search email / name…"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-600"
          />
        </div>
        <Select
          value={tenantId}
          aria-label="Tenant Id"
          onChange={(e) => { setTenantId(e.target.value); setPage(1); }}
          className="text-sm px-3 py-2.5 border border-gray-200 rounded-xl bg-white outline-none"
        >
          <option value="">All tenants</option>
          {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((s) => (
            <Button variant="quiet" type="button"
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {s === 'ALL' ? 'All' : USER_STATUS_META[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center px-6">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-700">No users match this view</p>
          <p className="text-xs text-gray-600 mt-1">Clear the search, or widen the tenant and status filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
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
                  // The server lists what it would accept for this account (organization
                  // type, platform separation, custom roles of its own organization).
                  const grantable: any[] = u.assignableRoles ?? [];
                  const self = u.id === user?.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60">
                      <td className="p-3">
                        <p className="font-medium text-gray-900">{nameOf(u)}</p>
                        <p className="text-xs text-gray-600">{u.email ?? u.phone ?? '—'}</p>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{u.tenant?.name ?? '—'}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1 items-center">
                          {(u.roles ?? []).map((r: any) => (
                            <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                              {r.name}
                              {!self && <Button variant="quiet" type="button"
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
                              >×</Button>}
                            </span>
                          ))}
                          {grantable.length > 0 && <Select disabled={assignRole.isPending}
                            value=""
                            aria-label={`Grant a role to ${nameOf(u)}`}
                            onChange={(e) => { try {
                              const roleId = e.target.value;
                              if (!roleId) return;
                              const role = grantable.find((r: any) => r.id === roleId);
                              setConfirm({
                                title: `Grant “${role?.name}”?`,
                                body: `${nameOf(u)} immediately gains every permission attached to this role.`,
                                cta: 'Grant role',
                                onConfirm: () => run(
                                  () => assignRole.mutateAsync({ userId: u.id, roleId }),
                                  `${role?.name} granted`),
                              });
                            } catch (error) { toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.')); } }}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white"
                          >
                            <option value="">+ Add role</option>
                            {grantable.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </Select>}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium', meta.color)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
                          </span>
                          <Select disabled={setUserStatus.isPending || self}
                            title={self ? 'You cannot change the status of your own account' : undefined}
                            value={u.status}
                            aria-label={`Status for ${nameOf(u)}`}
                            onChange={(e) => { try {
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
                            } catch (error) { toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.')); } }}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          >
                            {USER_STATUSES.map((s) => <option key={s} value={s}>{USER_STATUS_META[s].label}</option>)}
                          </Select>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="quiet" type="button"
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
                          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 hover:underline"
                        >
                          <LogOut className="h-3 w-3" /> Force logout
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">Page {page} of {totalPages} · {total} users</p>
              <div className="flex gap-1.5">
                <Button variant="quiet" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</Button>
                <Button variant="quiet" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
