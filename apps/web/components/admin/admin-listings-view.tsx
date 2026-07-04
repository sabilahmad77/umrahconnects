'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Store, RefreshCw, Loader2, AlertCircle, Search, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminListings, useApproveListing, useAdminRemoveListing } from '@/hooks/use-admin';

const STATUSES = ['ALL', 'DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'];

export function AdminListingsView() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useAdminListings({
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
  });
  const approve = useApproveListing();
  const remove = useAdminRemoveListing();
  const items = data?.items ?? [];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All marketplace listings</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} listings across every vendor &amp; tenant</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search listing…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load listings</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <Store className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400">No listings found</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Listing</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-left p-3">Price</th>
                <th className="text-left p-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    <Link href={`/marketplace/${l.id}`} className="text-brand-600 hover:underline font-medium">{l.name}</Link>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{l.type?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-xs text-gray-600">{l.vendor?.name ?? '—'} <span className="text-[10px] text-gray-400">{l.vendor?.status}</span></td>
                  <td className="p-3 font-medium">{l.currency} {(l.priceCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                      l.status === 'PUBLISHED' ? 'bg-green-50 text-green-700' :
                      l.status === 'PAUSED' ? 'bg-yellow-50 text-yellow-700' :
                      l.status === 'ARCHIVED' ? 'bg-gray-100 text-gray-500' :
                      'bg-blue-50 text-blue-700')}>{l.status ?? 'DRAFT'}</span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.status !== 'PUBLISHED' ? (
                        <button
                          onClick={async () => { await approve.mutateAsync(l.id); toast.success('Listing approved + published'); refetch(); }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700"
                        >
                          <CheckCircle2 className="h-3 w-3" /> Approve
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-green-50 text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      )}
                      <button
                        aria-label="Remove listing"
                        title="Archive (remove) this listing"
                        onClick={async () => { if (!confirm('Archive (remove) this listing?')) return; await remove.mutateAsync(l.id); toast.success('Removed'); refetch(); }}
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
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
