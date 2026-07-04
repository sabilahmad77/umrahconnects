'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, FileCheck2, Save, Edit3, Trash2,
  ListChecks, FileText, Calendar, Activity, Hash, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVisa, useUpdateVisa, useDeleteVisa, useAddVisaDocument, useUpdateVisaDocument, useRemoveVisaDocument } from '@/hooks/use-visa';

const VISA_STATUSES = [
  'NOT_STARTED',
  'DOCUMENTS_COLLECTING',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];

const VISA_TYPES = ['UMRAH', 'HAJJ', 'VISIT'];
const REGULATORY_SYSTEMS = ['NUSUK_MASAR', 'SISKOPATUH', 'MOH_SAUDI', 'EVISA_PORTAL', 'OTHER'];

type TabKey = 'overview' | 'documents' | 'timeline' | 'edit';

export function VisaDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, isLoading, error, refetch } = useVisa(id);
  const [tab, setTab] = useState<TabKey>('overview');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading visa application…
      </div>
    );
  }
  if (error || !v) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-gray-100">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500">Visa application not found</p>
        <Link href="/compliance" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to compliance</Link>
      </div>
    );
  }

  const pilgrimName = formatPilgrimName(v.pilgrim);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.push('/compliance')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
          <FileCheck2 className="h-6 w-6 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{pilgrimName}</h1>
          <p className="text-sm text-gray-500">
            {v.type ?? 'Visa'} · {formatSystem(v.regulatorySystem)}
            {v.externalRef ? ` · Ref ${v.externalRef}` : ''}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'documents', 'timeline', 'edit'] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-500 hover:bg-gray-50',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview v={v} />}
      {tab === 'documents' && <DocumentsTab v={v} refetch={refetch} />}
      {tab === 'timeline' && <TimelineTab v={v} />}
      {tab === 'edit' && <EditTab v={v} refetch={refetch} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'APPROVED' ? 'bg-green-50 text-green-700' :
    status === 'SUBMITTED' ? 'bg-blue-50 text-blue-700' :
    status === 'UNDER_REVIEW' ? 'bg-orange-50 text-orange-700' :
    status === 'DOCUMENTS_COLLECTING' ? 'bg-yellow-50 text-yellow-700' :
    status === 'REJECTED' ? 'bg-red-50 text-red-700' :
    status === 'EXPIRED' ? 'bg-gray-100 text-gray-500' :
    'bg-gray-100 text-gray-500';
  return <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full', color)}>{status?.replace(/_/g, ' ')}</span>;
}

function Overview({ v }: { v: any }) {
  const pilgrim = v.pilgrim ?? null;
  const pkg = v.package ?? v.booking?.package ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Application details
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Application #" value={v.applicationNumber ?? v.externalRef ?? '—'} />
          <Field label="Visa type" value={v.type ?? '—'} />
          <Field label="Regulatory system" value={formatSystem(v.regulatorySystem)} />
          <Field label="Status" value={(v.status ?? '—').replace(/_/g, ' ')} />
          <Field label="Visa number" value={v.visaNumber ?? '—'} />
          <Field label="External ref" value={v.externalRef ?? '—'} />
          <Field label="Submitted" value={v.submittedAt ? new Date(v.submittedAt).toLocaleString() : '—'} />
          <Field
            label="Decision"
            value={
              v.decisionAt
                ? new Date(v.decisionAt).toLocaleString()
                : v.approvedAt
                  ? new Date(v.approvedAt).toLocaleString()
                  : v.rejectedAt
                    ? new Date(v.rejectedAt).toLocaleString()
                    : '—'
            }
          />
          <Field label="Expires" value={v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '—'} />
          <Field label="Created" value={v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '—'} />
        </dl>

        {v.rejectionReason && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-red-600 mb-1">Rejection reason</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.rejectionReason}</p>
          </div>
        )}

        {v.notes && (
          <div className="pt-3 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-600 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{v.notes}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" /> Pilgrim
          </p>
          {pilgrim ? (
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-gray-900">{formatPilgrimName(pilgrim)}</p>
              {pilgrim.passportNumber && (
                <p className="text-xs text-gray-500">Passport: <span className="font-mono text-gray-700">{pilgrim.passportNumber}</span></p>
              )}
              {pilgrim.nationality && (
                <p className="text-xs text-gray-500">Nationality: {pilgrim.nationality}</p>
              )}
              {pilgrim.id && (
                <Link href={`/pilgrims/${pilgrim.id}`} className="text-xs text-brand-600 hover:underline inline-block mt-1">
                  View pilgrim →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No pilgrim linked</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Package
          </p>
          {pkg ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{pkg.name ?? pkg.title ?? '—'}</p>
              {pkg.code && <p className="text-xs text-gray-500">Code: {pkg.code}</p>}
              {pkg.id && (
                <Link href={`/packages/${pkg.id}`} className="text-xs text-brand-600 hover:underline inline-block mt-1">
                  View package →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No package linked</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-2 inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Key dates
          </p>
          <ul className="space-y-1.5 text-xs">
            <li><span className="text-gray-400">Submitted:</span> <span className="text-gray-700">{v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-400">Decision:</span> <span className="text-gray-700">{v.decisionAt ? new Date(v.decisionAt).toLocaleDateString() : v.approvedAt ? new Date(v.approvedAt).toLocaleDateString() : v.rejectedAt ? new Date(v.rejectedAt).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-400">Expires:</span> <span className="text-gray-700">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '—'}</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const DOC_TYPES = ['PASSPORT', 'PHOTO', 'ID_CARD', 'BANK_STATEMENT', 'INVITATION', 'VACCINATION', 'SUPPORTING', 'OTHER'];

function DocumentsTab({ v, refetch }: { v: any; refetch: () => void }) {
  const documents: any[] = Array.isArray(v.documents) ? v.documents : [];
  const add = useAddVisaDocument();
  const updateDoc = useUpdateVisaDocument();
  const removeDoc = useRemoveVisaDocument();
  const [form, setForm] = useState({ name: '', type: 'PASSPORT', url: '', status: 'RECEIVED' });

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Document name is required'); return; }
    try {
      await add.mutateAsync({ visaId: v.id, name: form.name.trim(), type: form.type, url: form.url || undefined, status: form.url ? 'RECEIVED' : form.status });
      toast.success('Document added');
      setForm({ name: '', type: 'PASSPORT', url: '', status: 'RECEIVED' });
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Add / upload document */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <FileText className="h-4 w-4" /> Upload / record a document
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Document name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" placeholder="Passport scan" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">File URL (leave empty to mark as missing)</span>
            <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" placeholder="https://…" />
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={submit} disabled={add.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Add document
          </button>
        </div>
      </div>

      {/* Document list */}
      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
            <FileText className="h-4 w-4" /> Documents ({documents.length})
          </h3>
        </div>
        {documents.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No documents recorded</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {documents.map((doc: any, i: number) => {
              const name = doc.name ?? doc.fileName ?? `Document ${i + 1}`;
              const type = doc.type ?? doc.documentType;
              const url = doc.url ?? doc.fileUrl;
              const docStatus = (doc.status ?? (url ? 'RECEIVED' : 'MISSING')).toUpperCase();
              return (
                <li key={doc.id ?? `${name}-${i}`} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline truncate block">{name}</a>
                      ) : (
                        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      )}
                      <p className="text-[11px] text-gray-400">{type ?? 'OTHER'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn('text-[11px] font-medium px-2 py-1 rounded-full',
                      docStatus === 'RECEIVED' ? 'bg-green-50 text-green-700' :
                      docStatus === 'MISSING' ? 'bg-red-50 text-red-600' :
                      'bg-yellow-50 text-yellow-700')}>{docStatus}</span>
                    {doc.id && (
                      <>
                        {docStatus !== 'RECEIVED' && (
                          <button onClick={async () => { await updateDoc.mutateAsync({ visaId: v.id, docId: doc.id, status: 'RECEIVED' }); toast.success('Marked received'); refetch(); }} className="text-[11px] px-2 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100">Received</button>
                        )}
                        {docStatus !== 'MISSING' && (
                          <button onClick={async () => { await updateDoc.mutateAsync({ visaId: v.id, docId: doc.id, status: 'MISSING' }); toast.success('Marked missing'); refetch(); }} className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">Missing</button>
                        )}
                        {docStatus === 'MISSING' && (
                          <button onClick={async () => { await updateDoc.mutateAsync({ visaId: v.id, docId: doc.id, status: 'REQUESTED' }); toast.success('Requested from applicant'); refetch(); }} className="text-[11px] px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100">Request</button>
                        )}
                        <button onClick={async () => { if (!confirm('Remove this document?')) return; await removeDoc.mutateAsync({ visaId: v.id, docId: doc.id }); refetch(); }} className="text-[11px] px-2 py-1 rounded-lg hover:bg-gray-100 text-gray-400">Remove</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ v }: { v: any }) {
  const events: any[] = Array.isArray(v.timeline)
    ? v.timeline
    : Array.isArray(v.statusHistory)
      ? v.statusHistory
      : Array.isArray(v.submissions)
        ? v.submissions
        : [];

  return (
    <div className="bg-white rounded-2xl border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Activity className="h-4 w-4" /> Timeline ({events.length})
        </h3>
      </div>
      {events.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400">No timeline events yet</div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {events.map((e: any, i: number) => {
            const status = e.status ?? e.event ?? e.type ?? '—';
            const at = e.at ?? e.createdAt ?? e.submittedAt ?? e.timestamp;
            const note = e.note ?? e.message ?? e.reason ?? e.batchRef;
            const actor = e.actor ?? e.by ?? e.user;
            return (
              <li key={e.id ?? i} className="p-4 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">
                      {String(status).replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {at ? new Date(at).toLocaleString() : '—'}
                    </p>
                  </div>
                  {note && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{note}</p>}
                  {actor && <p className="text-[11px] text-gray-400 mt-0.5">by {actor}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function EditTab({ v, refetch }: { v: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateVisa();
  const remove = useDeleteVisa();

  const [form, setForm] = useState({
    status: v.status ?? 'NOT_STARTED',
    applicationNumber: v.applicationNumber ?? v.externalRef ?? '',
    regulatorySystem: v.regulatorySystem ?? 'NUSUK_MASAR',
    type: v.type ?? 'UMRAH',
    notes: v.notes ?? '',
    submittedAt: v.submittedAt ? toDateTimeLocal(v.submittedAt) : '',
    decisionAt: v.decisionAt
      ? toDateTimeLocal(v.decisionAt)
      : v.approvedAt
        ? toDateTimeLocal(v.approvedAt)
        : v.rejectedAt
          ? toDateTimeLocal(v.rejectedAt)
          : '',
    expiresAt: v.expiresAt ? String(v.expiresAt).slice(0, 10) : '',
    rejectionReason: v.rejectionReason ?? '',
  });

  const save = async () => {
    try {
      await update.mutateAsync({
        id: v.id,
        status: form.status,
        applicationNumber: form.applicationNumber || undefined,
        externalRef: form.applicationNumber || undefined,
        regulatorySystem: form.regulatorySystem,
        type: form.type,
        notes: form.notes,
        submittedAt: form.submittedAt ? new Date(form.submittedAt).toISOString() : undefined,
        decisionAt: form.decisionAt ? new Date(form.decisionAt).toISOString() : undefined,
        expiresAt: form.expiresAt || undefined,
        rejectionReason: form.rejectionReason || undefined,
      });
      toast.success('Visa application saved');
      refetch();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  const archive = async () => {
    if (!confirm('Archive this visa application? You can re-activate it later.')) return;
    try {
      await remove.mutateAsync(v.id);
      toast.success('Visa application archived');
      router.push('/compliance');
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed');
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Edit application
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {VISA_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </FormField>
          <FormField label="Visa type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {VISA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Application number">
            <input value={form.applicationNumber} onChange={(e) => setForm({ ...form, applicationNumber: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Regulatory system">
            <select value={form.regulatorySystem} onChange={(e) => setForm({ ...form, regulatorySystem: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {REGULATORY_SYSTEMS.map((s) => <option key={s} value={s}>{formatSystem(s)}</option>)}
            </select>
          </FormField>
          <FormField label="Submitted at">
            <input type="datetime-local" value={form.submittedAt} onChange={(e) => setForm({ ...form, submittedAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Decision at">
            <input type="datetime-local" value={form.decisionAt} onChange={(e) => setForm({ ...form, decisionAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Expires at">
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Rejection reason">
            <input value={form.rejectionReason} onChange={(e) => setForm({ ...form, rejectionReason: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Notes" full>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400" />
          </FormField>
        </div>
        <div className="flex justify-end pt-2">
          <button onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50 hover:bg-brand-600">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save application
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Archive application
        </h3>
        <p className="text-xs text-gray-500 my-2">Removes the application from the active list. Past submissions are preserved.</p>
        <button onClick={archive} disabled={remove.isPending} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg disabled:opacity-50">
          {remove.isPending ? 'Archiving…' : 'Archive'}
        </button>
      </div>
    </div>
  );
}

function FormField({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cn('block', full && 'col-span-2')}>
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function formatPilgrimName(pilgrim: any): string {
  if (!pilgrim) return '—';
  const en = [pilgrim.firstNameEn, pilgrim.lastNameEn].filter(Boolean).join(' ').trim();
  if (en) return en;
  const ar = [pilgrim.firstNameAr, pilgrim.lastNameAr].filter(Boolean).join(' ').trim();
  if (ar) return ar;
  return pilgrim.name ?? '—';
}

function formatSystem(system?: string): string {
  if (!system) return '—';
  const map: Record<string, string> = {
    NUSUK_MASAR: 'Nusuk / Masar',
    SISKOPATUH: 'SISKOPATUH',
    MOH_SAUDI: 'MOH Saudi',
    EVISA_PORTAL: 'eVisa Portal',
    OTHER: 'Other',
  };
  return map[system] ?? system.replace(/_/g, ' ');
}

function toDateTimeLocal(value: string | Date): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
