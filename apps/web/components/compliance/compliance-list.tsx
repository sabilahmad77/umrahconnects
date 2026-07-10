'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileCheck2, Plus, RefreshCw, Search, CheckCircle2,
  XCircle, Clock, AlertCircle, X, Loader2, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useCompliance, useComplianceStats, useCreateVisaApplication, usePilgrims,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const VISA_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  NOT_STARTED:           { label: 'Not Started',     color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400' },
  DOCUMENTS_COLLECTING:  { label: 'Collecting Docs', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  SUBMITTED:             { label: 'Submitted',       color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  UNDER_REVIEW:          { label: 'Under Review',    color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  APPROVED:              { label: 'Approved',        color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  REJECTED:              { label: 'Rejected',        color: 'bg-red-100 text-red-600',      dot: 'bg-red-500' },
  EXPIRED:               { label: 'Expired',         color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
};

const FILTERS = ['ALL', 'NOT_STARTED', 'DOCUMENTS_COLLECTING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

export function ComplianceList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error, refetch } = useCompliance({
    page,
    limit: 20,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });
  const { data: stats } = useComplianceStats();
  const createVisa = useCreateVisaApplication();
  const pilgrimsQ = usePilgrims({ limit: 100 });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const statCards = [
    { label: 'Approved',     value: stats?.byStatus?.APPROVED ?? 0,     color: 'text-green-600',  Icon: CheckCircle2 },
    { label: 'Under Review', value: stats?.byStatus?.UNDER_REVIEW ?? 0, color: 'text-orange-600', Icon: Clock },
    { label: 'Submitted',    value: stats?.byStatus?.SUBMITTED ?? 0,    color: 'text-blue-600',   Icon: FileText },
    { label: 'Rejected',     value: stats?.byStatus?.REJECTED ?? 0,     color: 'text-red-500',    Icon: XCircle },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa & Compliance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} applications · Approval rate:{' '}
            {stats?.successRate != null ? `${Number(stats.successRate).toFixed(1)}%` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" />
            New Application
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{s.value.toLocaleString()}</p>
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', s.color)}>
              <s.Icon className="h-3.5 w-3.5" /> {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* BP-04: regulator API integrations are on the roadmap, not live — the
          chips say so honestly. Applications are tracked here and submitted on
          the official portals until direct integrations ship. */}
      <div className="flex flex-wrap items-center gap-2">
        {['Nusuk / Masar', 'SISKOPATUH', 'MOH Saudi', 'eVisa Portal'].map((label) => (
          <span
            key={label}
            title="Direct API integration planned — applications are tracked in-platform and submitted on the official portal today"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200"
          >
            <Clock className="h-3 w-3" />
            {label}
            <span className="text-[9px] font-bold tracking-wide text-gold-600 bg-gold-50 px-1.5 py-0.5 rounded-full">PLANNED</span>
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search applications..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                statusFilter === f
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {f === 'ALL' ? 'All' : VISA_STATUS[f]?.label ?? f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load applications</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Pilgrim</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Visa Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Passport</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-20 text-center">
                      <FileCheck2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-500">No visa applications found</p>
                    </td>
                  </tr>
                ) : items.map((v: any) => {
                  const cfg = VISA_STATUS[v.status] ?? { label: v.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  const pilgrimName = v.pilgrim
                    ? [v.pilgrim.firstNameEn, v.pilgrim.lastNameEn].filter(Boolean).join(' ') || v.pilgrim.firstNameAr || '—'
                    : '—';
                  return (
                    <tr key={v.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer">
                      <td className="px-5 py-3.5">
                        <Link href={`/compliance/${v.id}`} className="flex items-center gap-3 hover:underline">
                          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-600 text-xs font-bold shrink-0">
                            {pilgrimName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{pilgrimName}</p>
                            <p className="text-xs text-gray-500">{v.pilgrim?.nationality ?? '—'}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-sm font-mono text-gray-700">{v.pilgrim?.passportNumber ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className="text-sm text-gray-600">{v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">Page {page} of {totalPages} · {total} results</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
                  <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <NewVisaModal
          pilgrims={pilgrimsQ.data?.items ?? []}
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try { await createVisa.mutateAsync(dto); toast.success('Visa application created'); setShowCreate(false); refetch(); }
            catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Failed'); }
          }}
          pending={createVisa.isPending}
        />
      )}
    </div>
  );
}

function NewVisaModal({
  pilgrims, onClose, onCreate, pending,
}: { pilgrims: any[]; onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [pilgrimId, setPilgrimId] = useState(pilgrims[0]?.id ?? '');
  const [type, setType] = useState('UMRAH');
  const [regulatorySystem, setRegulatorySystem] = useState('NUSUK_MASAR');
  const [passportNumber, setPassportNumber] = useState('');
  const [fees, setFees] = useState('');
  const [notes, setNotes] = useState('');

  // Auto-pick first pilgrim once they load
  if (!pilgrimId && pilgrims[0]?.id) setPilgrimId(pilgrims[0].id);

  const submit = () => onCreate({
    pilgrimId,
    type,
    regulatorySystem,
    passportNumber: passportNumber || undefined,
    fees: fees ? Number(fees) : undefined,
    notes: notes || undefined,
    currency: 'SAR',
  });

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New visa application</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        {pilgrims.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No pilgrims yet — add a pilgrim first.</p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Pilgrim *</span>
              <select value={pilgrimId} onChange={(e) => setPilgrimId(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                {pilgrims.map((p) => (
                  <option key={p.id} value={p.id}>
                    {[p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.id.slice(0, 8)} {p.passportNumber ? `· ${p.passportNumber}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Visa type *</span>
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                  <option value="UMRAH">Umrah</option>
                  <option value="HAJJ">Hajj</option>
                  <option value="VISIT">Visit</option>
                </select>
              </label>
              <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">System *</span>
                <select value={regulatorySystem} onChange={(e) => setRegulatorySystem(e.target.value)} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                  <option value="NUSUK_MASAR">Nusuk / Masar</option>
                  <option value="SISKOPATUH">SISKOPATUH</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Passport #</span><input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} placeholder="A1234567" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" /></label>
              <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Fees (SAR)</span><input type="number" min="0" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="500" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" /></label>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none" />
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={pending || !pilgrimId} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Create application
          </button>
        </div>
      </div>
    </div>
  );
}
