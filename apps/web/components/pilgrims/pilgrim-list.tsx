'use client';

import { useState } from 'react';
import {
  Search, Plus, Download, Users, CheckCircle2, Clock,
  XCircle, Plane, MoreHorizontal, FileText, Eye, Edit, RefreshCw,
  X, Loader2, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  usePilgrims, usePilgrimStats, useCreatePilgrim, useUpdatePilgrim, useDeletePilgrim,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; icon: any }> = {
  LEAD:                { label: 'Lead',          color: 'bg-gray-100 text-gray-600',    dot: 'bg-gray-400',   icon: Clock },
  DOCUMENTS_PENDING:   { label: 'Docs Pending',  color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500', icon: FileText },
  VISA_PENDING:        { label: 'Visa Pending',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500',   icon: Clock },
  VISA_APPROVED:       { label: 'Visa Approved', color: 'bg-green-100 text-green-700',  dot: 'bg-green-500',  icon: CheckCircle2 },
  VISA_REJECTED:       { label: 'Visa Rejected', color: 'bg-red-100 text-red-700',      dot: 'bg-red-500',    icon: XCircle },
  TRAVELING:           { label: 'Traveling',     color: 'bg-brand-100 text-brand-700',  dot: 'bg-brand-500',  icon: Plane },
  IN_KINGDOM:          { label: 'In Kingdom',    color: 'bg-saudi-500/10 text-saudi-600', dot: 'bg-saudi-500', icon: Plane },
  RETURNED:            { label: 'Returned',      color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', icon: CheckCircle2 },
  CANCELLED:           { label: 'Cancelled',     color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-300',   icon: XCircle },
};

const FLAG: Record<string, string> = {
  ID: '🇮🇩', SA: '🇸🇦', PK: '🇵🇰', MY: '🇲🇾', NG: '🇳🇬', TR: '🇹🇷', EG: '🇪🇬',
  BD: '🇧🇩', IN: '🇮🇳', MA: '🇲🇦', IQ: '🇮🇶', SN: '🇸🇳',
};

const FILTERS = ['ALL', 'DOCUMENTS_PENDING', 'VISA_PENDING', 'VISA_APPROVED', 'TRAVELING', 'IN_KINGDOM', 'RETURNED'];

export function PilgrimList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [editPilgrim, setEditPilgrim] = useState<any | null>(null);
  const [viewPilgrim, setViewPilgrim] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = usePilgrims({
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  });
  const { data: stats } = usePilgrimStats();
  const createPilgrim = useCreatePilgrim();
  const updatePilgrim = useUpdatePilgrim();
  const deletePilgrim = useDeletePilgrim();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pilgrims & CRM</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString()} pilgrims total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-400 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const rows = items;
              if (!rows.length) { toast('Nothing to export'); return; }
              const header = ['firstNameEn', 'lastNameEn', 'email', 'phone', 'passportNumber', 'passportExpiry', 'nationality', 'status', 'createdAt'];
              const csv = [
                header.join(','),
                ...rows.map((r: any) => header.map((k) => {
                  const v = r[k];
                  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
                  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
                }).join(',')),
              ].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `pilgrims-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(`Exported ${rows.length} pilgrims`);
            }}
            className="flex items-center gap-2 text-sm px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" />
            Add Pilgrim
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{(stats.total ?? 0).toLocaleString()}</p>
            <p className="text-xs font-medium text-gray-500 mt-1">👥 Total Pilgrims</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{(stats.byStatus?.IN_KINGDOM ?? 0).toLocaleString()}</p>
            <p className="text-xs font-medium text-saudi-600 mt-1">🕋 In Kingdom</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{(stats.byStatus?.VISA_PENDING ?? 0).toLocaleString()}</p>
            <p className="text-xs font-medium text-blue-600 mt-1">📋 Visa Pending</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{(stats.byStatus?.DOCUMENTS_PENDING ?? 0).toLocaleString()}</p>
            <p className="text-xs font-medium text-yellow-600 mt-1">📄 Docs Pending</p>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-80 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, passport, phone..."
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                statusFilter === s
                  ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              {s === 'ALL' ? 'All Pilgrims' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-20 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <Users className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load pilgrims</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Pilgrim</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Passport</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Nationality</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center">
                      <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-400">No pilgrims found</p>
                    </td>
                  </tr>
                ) : items.map((pilgrim: any) => {
                  const name = [pilgrim.firstNameEn, pilgrim.lastNameEn].filter(Boolean).join(' ') || pilgrim.firstNameAr || '—';
                  const cfg = STATUS_CONFIG[pilgrim.status] ?? { label: pilgrim.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400', icon: Clock };
                  const StatusIcon = cfg.icon;
                  return (
                    <tr key={pilgrim.id} onClick={() => { window.location.href = `/pilgrims/${pilgrim.id}`; }} className="hover:bg-gray-50/60 transition-colors cursor-pointer">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-800">{name}</span>
                              <span className="text-sm">{FLAG[pilgrim.nationality] ?? ''}</span>
                            </div>
                            <p className="text-xs text-gray-400">{pilgrim.phone ?? pilgrim.email ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-sm font-mono text-gray-700">{pilgrim.passportNumber ?? '—'}</p>
                        {pilgrim.passportExpiry && (
                          <p className="text-xs text-gray-400">Exp: {new Date(pilgrim.passportExpiry).toLocaleDateString()}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className="text-sm text-gray-700">{pilgrim.nationality ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewPilgrim(pilgrim); }}
                            title="View"
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditPilgrim(pilgrim); }}
                            title="Edit"
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Archive ${pilgrim.firstNameEn ?? 'this pilgrim'}? This is a soft delete and can be restored later.`)) return;
                              try {
                                await deletePilgrim.mutateAsync(pilgrim.id);
                                toast.success('Pilgrim archived');
                              } catch (e: any) {
                                toast.error(e?.response?.data?.error?.message ?? 'Failed');
                              }
                            }}
                            title="Archive"
                            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Page {page} of {totalPages} · {total.toLocaleString()} results</p>
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
        <PilgrimFormModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSubmit={async (dto) => {
            try {
              await createPilgrim.mutateAsync(dto);
              toast.success('Pilgrim added');
              setShowCreate(false);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed');
            }
          }}
          pending={createPilgrim.isPending}
        />
      )}

      {editPilgrim && (
        <PilgrimFormModal
          mode="edit"
          initial={editPilgrim}
          onClose={() => setEditPilgrim(null)}
          onSubmit={async (dto) => {
            try {
              await updatePilgrim.mutateAsync({ id: editPilgrim.id, ...dto });
              toast.success('Pilgrim updated');
              setEditPilgrim(null);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.message ?? 'Failed');
            }
          }}
          pending={updatePilgrim.isPending}
        />
      )}

      {viewPilgrim && (
        <PilgrimDetailModal
          pilgrim={viewPilgrim}
          onClose={() => setViewPilgrim(null)}
          onEdit={() => { setEditPilgrim(viewPilgrim); setViewPilgrim(null); }}
        />
      )}
    </div>
  );
}

// ─── Pilgrim Form Modal (create + edit) ─────────────────────────────────────
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'IN', name: 'India' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'EG', name: 'Egypt' },
  { code: 'MA', name: 'Morocco' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'SN', name: 'Senegal' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'AE', name: 'UAE' },
];

const PILGRIM_STATUSES = [
  'LEAD', 'REGISTERED', 'DOCUMENT_COLLECTION',
  'VISA_APPLIED', 'VISA_APPROVED', 'DEPARTED',
  'IN_MAKKAH', 'IN_MADINAH', 'RETURNED', 'CANCELLED',
];

function PilgrimFormModal({
  mode, initial, onClose, onSubmit, pending,
}: {
  mode: 'create' | 'edit';
  initial?: any;
  onClose: () => void;
  onSubmit: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const [firstName, setFirstName] = useState(initial?.firstNameEn ?? '');
  const [lastName, setLastName]   = useState(initial?.lastNameEn ?? '');
  const [email, setEmail]         = useState(initial?.email ?? '');
  const [phone, setPhone]         = useState(initial?.phone ?? '');
  const [nationality, setNationality] = useState(initial?.nationality ?? 'SA');
  const [passportNumber, setPassportNumber] = useState(initial?.passportNumber ?? '');
  const [passportExpiry, setPassportExpiry] = useState(
    initial?.passportExpiry ? new Date(initial.passportExpiry).toISOString().slice(0, 10) : ''
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    initial?.dateOfBirth ? new Date(initial.dateOfBirth).toISOString().slice(0, 10) : ''
  );
  const [gender, setGender]       = useState(initial?.gender ?? 'MALE');
  const [status, setStatus]       = useState(initial?.status ?? 'LEAD');
  const [notes, setNotes]         = useState(initial?.notes ?? '');

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      nationality,
      passportNumber: passportNumber.trim() || undefined,
      passportExpiry: passportExpiry ? new Date(passportExpiry).toISOString() : undefined,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth).toISOString() : undefined,
      gender,
      status,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{mode === 'create' ? 'Add pilgrim' : 'Edit pilgrim'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *">
            <input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} placeholder="Ahmed" />
          </Field>
          <Field label="Last name *">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} placeholder="Al-Faisal" />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="ahmed@example.com" />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+966 5..." />
          </Field>
          <Field label="Nationality">
            <select value={nationality} onChange={(e) => setNationality(e.target.value)} className={inputCls}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={inputCls}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </Field>
          <Field label="Passport number">
            <input value={passportNumber} onChange={(e) => setPassportNumber(e.target.value)} className={inputCls} placeholder="A12345678" />
          </Field>
          <Field label="Passport expiry">
            <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              {PILGRIM_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls + ' resize-none'} placeholder="Internal notes about this pilgrim…" />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button
            onClick={submit}
            disabled={pending || !firstName.trim() || !lastName.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === 'create' ? 'Add pilgrim' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PilgrimDetailModal({ pilgrim, onClose, onEdit }: { pilgrim: any; onClose: () => void; onEdit: () => void }) {
  const fullName = `${pilgrim.firstNameEn ?? ''} ${pilgrim.lastNameEn ?? ''}`.trim() || '—';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{fullName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{pilgrim.status?.replace(/_/g, ' ') ?? '—'} · {pilgrim.nationality ?? '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Detail label="Email" value={pilgrim.email} />
          <Detail label="Phone" value={pilgrim.phone} />
          <Detail label="Passport" value={pilgrim.passportNumber} mono />
          <Detail label="Passport expiry" value={pilgrim.passportExpiry ? new Date(pilgrim.passportExpiry).toLocaleDateString() : null} />
          <Detail label="Date of birth" value={pilgrim.dateOfBirth ? new Date(pilgrim.dateOfBirth).toLocaleDateString() : null} />
          <Detail label="Gender" value={pilgrim.gender} />
          <Detail label="Family group" value={pilgrim.familyGroup?.name} />
          <Detail label="Created" value={pilgrim.createdAt ? new Date(pilgrim.createdAt).toLocaleDateString() : null} />
          {pilgrim.notes && (
            <div className="col-span-2 mt-2 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Notes</p>
              <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{pilgrim.notes}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
          <button onClick={onEdit} className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg shadow-sm">Edit</button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none bg-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
function Detail({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn('text-gray-800 mt-0.5', mono && 'font-mono')}>{value || '—'}</p>
    </div>
  );
}
