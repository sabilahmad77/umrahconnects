'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FolderOpen, RefreshCw, AlertCircle, Loader2, CheckCircle2, XCircle,
  CalendarClock, HardDrive, FileText, Clock, Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAllVisaDocuments, useVisaDocumentStats } from '@/hooks/use-visa';
import {
  VISA_DOCUMENT_STATUSES, VISA_DOCUMENT_STATUS_META, humanizeStatus,
} from '@/lib/statuses';

const FILTERS = ['ALL', ...VISA_DOCUMENT_STATUSES] as const;

/**
 * Tenant-wide document register: every document across every visa
 * application, with the expiry watch-list and an honest read on where the
 * files are actually stored.
 */
export function VisaDocumentsView() {
  const [filter, setFilter] = useState<string>('ALL');
  const { data: docs = [], isLoading, error, refetch } = useAllVisaDocuments(filter !== 'ALL' ? filter : undefined);
  const { data: stats } = useVisaDocumentStats();

  const storage = stats?.storage;
  const tiles = [
    { label: 'Verified', value: stats?.byStatus?.VERIFIED ?? 0, color: 'text-green-600',  Icon: CheckCircle2 },
    { label: 'Received', value: stats?.byStatus?.RECEIVED ?? 0, color: 'text-blue-600',   Icon: FileText },
    { label: 'Missing',  value: stats?.byStatus?.MISSING ?? 0,  color: 'text-gray-600',   Icon: XCircle },
    { label: 'Expired',  value: stats?.expired ?? 0,            color: 'text-orange-600', Icon: CalendarClock },
  ];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {(stats?.total ?? docs.length).toLocaleString()} documents across every visa application
            {stats?.expiringSoon ? ` · ${stats.expiringSoon} expiring within 30 days` : ''}
          </p>
        </div>
        <button onClick={() => refetch()} aria-label="Refresh documents" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Storage truth — never imply files are durable when they are not. */}
      {storage && (
        <div className={cn(
          'flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs',
          storage.ephemeral || !storage.configured
            ? 'bg-gold-50 border-gold-200 text-gold-800'
            : 'bg-green-50 border-green-200 text-green-800',
        )}>
          <HardDrive className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Storage: {storage.driver}</span>
            {storage.ephemeral
              ? ' — files are written to the server disk, which is wiped on every deploy. Set STORAGE_DRIVER to s3 or cloudinary (and supply the keys) for durable storage.'
              : storage.configured
                ? ' — durable object storage is configured.'
                : ` — not configured. Missing: ${(storage.missing ?? []).join(', ')}.`}
          </p>
        </div>
      )}

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

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
              filter === f ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
          >
            {f === 'ALL' ? 'All' : VISA_DOCUMENT_STATUS_META[f]?.label ?? f}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading documents…
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load documents</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : docs.length === 0 ? (
          <div className="py-16 text-center px-6">
            <FolderOpen className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-semibold text-gray-700">No documents match this view</p>
            <p className="text-xs text-gray-500 mt-1">
              Documents are added from a visa application — open one and use its Documents tab.
            </p>
            <Link href="/compliance" className="text-xs text-brand-500 hover:underline mt-2 inline-block">
              Go to visa applications →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left p-3">Document</th>
                  <th className="text-left p-3">Applicant</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3 hidden md:table-cell">Version</th>
                  <th className="text-left p-3 hidden lg:table-cell">Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {docs.map((d: any) => {
                  const status = d.effectiveStatus ?? d.status;
                  const meta = VISA_DOCUMENT_STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/60">
                      <td className="p-3">
                        <Link href={`/compliance/${d.applicationId}`} className="hover:underline">
                          <p className="font-medium text-gray-900">{d.name}</p>
                          <p className="text-[11px] text-gray-500">{humanizeStatus(d.type)}</p>
                        </Link>
                      </td>
                      <td className="p-3 text-xs text-gray-600">
                        {d.application?.applicantName ?? d.application?.applicationNumber ?? '—'}
                      </td>
                      <td className="p-3">
                        <span className={cn('inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full font-medium', meta.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
                        </span>
                        {d.rejectionReason && (
                          <p className="text-[11px] text-red-600 mt-1 max-w-xs truncate">{d.rejectionReason}</p>
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell text-xs text-gray-600 font-mono">
                        {d.version > 0 ? `v${d.version}` : '—'}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {d.expiresAt ? (
                          <span className={cn('text-xs inline-flex items-center gap-1', d.isExpired ? 'text-orange-600 font-semibold' : 'text-gray-600')}>
                            <Clock className="h-3 w-3" />{new Date(d.expiresAt).toLocaleDateString()}
                          </span>
                        ) : <span className="text-xs text-gray-500">—</span>}
                      </td>
                      <td className="p-3 text-right">
                        {d.url ? (
                          <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                            <Download className="h-3 w-3" /> Open
                          </a>
                        ) : (
                          <Link href={`/compliance/${d.applicationId}`} className="text-xs text-gray-500 hover:underline">Attach →</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
