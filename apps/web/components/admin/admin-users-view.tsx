'use client';

import { useState } from 'react';
import { Users, RefreshCw, Loader2, AlertCircle, Search, LogOut, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAdminUsers, useSetUserStatus, useForceLogout, useAssignUserRole, useRemoveUserRole, useAdminRoles,
} from '@/hooks/use-admin';

const STATUSES = ['ALL', 'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'];

export function AdminUsersView() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useAdminUsers({
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
  });
  const { data: roles = [] } = useAdminRoles();
  const setUserStatus = useSetUserStatus();
  const forceLogout = useForceLogout();
  const assignRole = useAssignUserRole();
  const removeRole = useRemoveUserRole();
  const items = data?.items ?? [];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} users across all tenants</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email / name…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
            >
              {s.replace(/_/g, ' ')}
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
          <p className="text-sm text-red-500">Failed to load users</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <Users className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No users found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
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
              {items.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                    <p className="text-[11px] text-gray-500">{u.email ?? u.phone ?? '—'}</p>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{u.tenant?.name ?? '—'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 items-center">
                      {(u.roles ?? []).map((r: any) => (
                        <span key={r.id} className="inline-flex items-center gap-1 text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full">
                          {r.name}
                          <button onClick={async () => { await removeRole.mutateAsync({ userId: u.id, roleId: r.id }); toast.success('Removed'); refetch(); }} className="hover:text-red-600">×</button>
                        </span>
                      ))}
                      <select
                        defaultValue=""
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          await assignRole.mutateAsync({ userId: u.id, roleId: e.target.value });
                          toast.success('Role assigned');
                          e.target.value = '';
                          refetch();
                        }}
                        className="text-[10px] border border-gray-200 rounded-lg px-1.5 py-0.5 bg-white"
                      >
                        <option value="">+ Add role</option>
                        {roles.filter((r: any) => !(u.roles ?? []).some((ur: any) => ur.id === r.id)).map((r: any) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}</td>
                  <td className="p-3">
                    <select
                      value={u.status}
                      onChange={async (e) => { await setUserStatus.mutateAsync({ id: u.id, status: e.target.value }); toast.success('Updated'); refetch(); }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={async () => { await forceLogout.mutateAsync(u.id); toast.success('Sessions revoked'); }}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 hover:underline"
                      title="Force logout"
                    >
                      <LogOut className="h-3 w-3" /> Force logout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
