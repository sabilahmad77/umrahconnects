'use client';

import { useState } from 'react';
import { Building2, RefreshCw, Loader2, AlertCircle, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminTenants, useSetTenantStatus, useArchiveTenant } from '@/hooks/use-admin';

const STATUSES = ['ALL', 'PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'INACTIVE'];

export function AdminTenantsView() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useAdminTenants({
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
  });
  const setTenantStatus = useSetTenantStatus();
  const archive = useArchiveTenant();
  const items = data?.items ?? [];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All tenants</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} tenants across the platform</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tenant name…" className="text-sm bg-transparent flex-1 outline-none" />
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
          <p className="text-sm text-red-500">Failed to load tenants</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No tenants found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Tenant</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Country</th>
                <th className="text-left p-3">Users</th>
                <th className="text-left p-3">Created</th>
                <th className="text-left p-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <p className="font-medium text-gray-900">{t.name}</p>
                    <p className="text-[11px] text-gray-500">{t.email ?? '—'} · {t.slug}</p>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{t.type?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-xs text-gray-600">{t.country}</td>
                  <td className="p-3">{t._count?.users ?? 0}</td>
                  <td className="p-3 text-xs text-gray-600">{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td className="p-3">
                    <select
                      value={t.status}
                      onChange={async (e) => {
                        await setTenantStatus.mutateAsync({ id: t.id, status: e.target.value });
                        toast.success('Status updated');
                        refetch();
                      }}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                    >
                      {['PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'INACTIVE'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={async () => { if (!confirm('Archive this tenant?')) return; await archive.mutateAsync(t.id); toast.success('Archived'); refetch(); }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
