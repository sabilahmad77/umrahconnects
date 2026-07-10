'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderOpen, RefreshCw, AlertCircle, Loader2, Paperclip, CheckCircle2,
  XCircle, Bell, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAllVisaDocuments, useUpdateVisaDocument } from '@/hooks/use-visa';

const DOC_STATUSES = ['ALL', 'RECEIVED', 'MISSING', 'REQUESTED'];

export function VisaDocumentsView() {
  const [filter, setFilter] = useState('ALL');
  const { data: docs = [], isLoading, error, refetch } = useAllVisaDocuments(filter !== 'ALL' ? filter : undefined);
  const update = useUpdateVisaDocument();

  const counts = {
    received: docs.filter((d: any) => d.status === 'RECEIVED').length,
    missing: docs.filter((d: any) => d.status === 'MISSING').length,
    requested: docs.filter((d: any) => d.status === 'REQUESTED').length,
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document management</h1>
          <p className="text-sm text-gray-500 mt-0.5">All documents across every visa application</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Received" value={counts.received} color="text-green-600" icon={CheckCircle2} />
        <SummaryTile label="Missing" value={counts.missing} color="text-red-600" icon={XCircle} />
        <SummaryTile label="Requested" value={counts.requested} color="text-yellow-600" icon={Bell} />
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {DOC_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
              filter === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
          >
            {s}
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
          <p className="text-sm text-red-500">Failed to load documents</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-500">No documents yet — add documents from a visa application</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left p-3">Document</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Application</th>
                <th className="text-left p-3">Applicant</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map((d: any) => (
                <tr key={`${d.visaId}-${d.id}`} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-brand-600 hover:underline font-medium">
                        <Paperclip className="h-3.5 w-3.5" /> {d.name}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-gray-700 font-medium">
                        <Paperclip className="h-3.5 w-3.5 text-gray-500" /> {d.name}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{d.type ?? '—'}</td>
                  <td className="p-3 text-xs">
                    <Link href={`/compliance/${d.visaId}`} className="text-brand-600 hover:underline">{d.applicationNumber ?? d.visaId.slice(0, 8)}</Link>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{d.applicantName ?? '—'}</td>
                  <td className="p-3">
                    <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                      d.status === 'RECEIVED' ? 'bg-green-50 text-green-700' :
                      d.status === 'MISSING' ? 'bg-red-50 text-red-600' :
                      'bg-yellow-50 text-yellow-700')}>{d.status}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {d.status !== 'RECEIVED' && (
                        <button
                          onClick={async () => {
                            await update.mutateAsync({ visaId: d.visaId, docId: d.id, status: 'RECEIVED' });
                            toast.success('Marked received');
                            refetch();
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100"
                        >
                          Mark received
                        </button>
                      )}
                      {d.status !== 'MISSING' && (
                        <button
                          onClick={async () => {
                            await update.mutateAsync({ visaId: d.visaId, docId: d.id, status: 'MISSING' });
                            toast.success('Marked missing');
                            refetch();
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          Mark missing
                        </button>
                      )}
                      {d.status === 'MISSING' && (
                        <button
                          onClick={async () => {
                            await update.mutateAsync({ visaId: d.visaId, docId: d.id, status: 'REQUESTED' });
                            toast.success('Document requested from applicant');
                            refetch();
                          }}
                          className="text-[11px] px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 inline-flex items-center gap-1"
                        >
                          <Bell className="h-3 w-3" /> Request
                        </button>
                      )}
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

function SummaryTile({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
      <Icon className={cn('h-8 w-8', color)} />
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
