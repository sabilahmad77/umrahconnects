'use client';

import { useState } from 'react';
import { ShieldCheck, RefreshCw, Loader2, AlertCircle, CheckCircle2, XCircle, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminKyc, useApproveKyc, useRejectKyc } from '@/hooks/use-admin';

const FILTERS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

export function AdminKycView() {
  const [filter, setFilter] = useState('PENDING');
  const { data: items = [], isLoading, error, refetch } = useAdminKyc(filter !== 'ALL' ? filter : undefined);
  const approve = useApproveKyc();
  const reject = useRejectKyc();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYC verification</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} KYC submissions</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
              filter === f ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load KYC submissions</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No KYC submissions in this state</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((k: any) => {
            const state = k.verifiedAt ? 'APPROVED' : k.rejectionReason ? 'REJECTED' : 'PENDING';
            return (
              <div key={k.id} className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-yellow-50 text-yellow-700 flex items-center justify-center"><Building2 className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{k.tenant?.name ?? '—'}</p>
                      <p className="text-[11px] text-gray-500">
                        {k.tenant?.type?.replace(/_/g, ' ')} · {k.tenant?.country} · {k.tenant?.email ?? '—'}
                      </p>
                      <p className="text-[10px] text-gray-500">Registry: {k.registrySource} · submitted {new Date(k.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                    state === 'APPROVED' ? 'bg-green-50 text-green-700' :
                    state === 'REJECTED' ? 'bg-red-50 text-red-600' :
                    'bg-yellow-50 text-yellow-700')}>{state}</span>
                </div>
                {k.documents && Array.isArray(k.documents) && k.documents.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <p className="text-xs font-semibold text-gray-600 mb-1">Documents ({k.documents.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {k.documents.map((d: any, i: number) => (
                        <span key={i} className="text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{d.name ?? d.type ?? `Document ${i + 1}`}</span>
                      ))}
                    </div>
                  </div>
                )}
                {k.rejectionReason && (
                  <p className="mt-3 pt-3 border-t border-gray-50 text-xs text-red-600">Reason: {k.rejectionReason}</p>
                )}
                {state === 'PENDING' && (
                  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={async () => {
                        const reason = prompt('Rejection reason:');
                        if (!reason) return;
                        await reject.mutateAsync({ id: k.id, reason });
                        toast.success('Rejected');
                        refetch();
                      }}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                    >
                      <XCircle className="h-3 w-3" /> Reject
                    </button>
                    <button
                      onClick={async () => {
                        await approve.mutateAsync({ id: k.id });
                        toast.success('Approved + tenant activated');
                        refetch();
                      }}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
