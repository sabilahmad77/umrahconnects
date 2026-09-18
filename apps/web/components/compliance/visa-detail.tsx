'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Select, Input, Textarea , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, FileCheck2, Save, Edit3, Trash2,
  ListChecks, FileText, Calendar, Activity, Hash, Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useVisa, useUpdateVisa, useDeleteVisa, useSubmitVisa, useApproveVisa, useRejectVisa } from '@/hooks/use-visa';
import { VisaDocumentPanel } from './visa-document-panel';

// Statuses that are an ordinary edit. Submitting, approving and rejecting are
// decisions, not field changes: they each have their own endpoint that records
// the timestamp, the visa number or the reason, and notifies the applicant.
// Pushing them through the generic update silently dropped all of that.
const VISA_STATUSES = [
  'NOT_STARTED',
  'DOCUMENTS_COLLECTING',
  'UNDER_REVIEW',
  'EXPIRED',
];

const VISA_TYPES = ['UMRAH', 'HAJJ', 'VISIT'];
// The real RegulatorySystem enum (prisma/schema.prisma). MOH_SAUDI, EVISA_PORTAL
// and OTHER are not members: because this field is sent on every save, any record
// already holding one of them could not be edited at all.
const REGULATORY_SYSTEMS = ['NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC', 'IBA_DGRP', 'MANUAL'];

type TabKey = 'overview' | 'documents' | 'timeline' | 'edit';

export function VisaDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, isLoading, error, refetch } = useVisa(id);
  const [tab, setTab] = useState<TabKey>('overview');

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-600 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading visa application…
      </div>
    );
  }
  if (error || !v) {
    return (
      <div className="py-20 text-center bg-white rounded-xl border border-gray-200">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-700 opacity-60" />
        <p className="text-sm text-red-700">Visa application not found</p>
        <Link href="/compliance" className="text-xs text-brand-500 hover:underline mt-3 inline-block">← Back to compliance</Link>
      </div>
    );
  }

  const pilgrimName = formatPilgrimName(v.pilgrim);


  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Go back" onClick={() => router.push('/compliance')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Button>
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
          <FileCheck2 className="h-6 w-6 text-green-800" />
        </div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900 ">{pilgrimName}</h1>
          <p className="text-sm text-gray-600">
            {v.type ?? 'Visa'} · {formatSystem(v.regulatorySystem)}
            {v.externalRef ? ` · Ref ${v.externalRef}` : ''}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {(['overview', 'documents', 'timeline', 'edit'] as TabKey[]).map((t) => (
          <Button variant="quiet" type="button"
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'capitalize px-3 py-2 rounded-xl text-sm font-medium transition-colors',
              tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            {t}
          </Button>
        ))}
      </div>

      {tab === 'overview' && <Overview v={v} />}
      {tab === 'documents' && <VisaDocumentPanel visaId={v.id} />}
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
    status === 'EXPIRED' ? 'bg-gray-100 text-gray-600' :
    'bg-gray-100 text-gray-600';
  return <span className={cn('text-xs font-medium px-2 py-1 rounded-full', color)}>{status?.replace(/_/g, ' ')}</span>;
}

function Overview({ v }: { v: any }) {
  const pilgrim = v.pilgrim ?? null;
  const pkg = v.package ?? v.booking?.package ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
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
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1">
            <Hash className="h-3.5 w-3.5" /> Pilgrim
          </p>
          {pilgrim ? (
            <div className="space-y-1.5 text-sm">
              <p className="font-medium text-gray-900">{formatPilgrimName(pilgrim)}</p>
              {pilgrim.passportNumber && (
                <p className="text-xs text-gray-600">Passport: <span className="font-mono text-gray-700">{pilgrim.passportNumber}</span></p>
              )}
              {pilgrim.nationality && (
                <p className="text-xs text-gray-600">Nationality: {pilgrim.nationality}</p>
              )}
              {pilgrim.id && (
                <Link href={`/pilgrims/${pilgrim.id}`} className="text-xs text-brand-600 hover:underline inline-block mt-1">
                  View pilgrim →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No pilgrim linked</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Package
          </p>
          {pkg ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{pkg.name ?? pkg.title ?? '—'}</p>
              {pkg.code && <p className="text-xs text-gray-600">Code: {pkg.code}</p>}
              {pkg.id && (
                <Link href="/packages" className="text-xs text-brand-600 hover:underline inline-block mt-1">
                  View package →
                </Link>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No package linked</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> Key dates
          </p>
          <ul className="space-y-1.5 text-xs">
            <li><span className="text-gray-600">Submitted:</span> <span className="text-gray-700">{v.submittedAt ? new Date(v.submittedAt).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-600">Decision:</span> <span className="text-gray-700">{v.decisionAt ? new Date(v.decisionAt).toLocaleDateString() : v.approvedAt ? new Date(v.approvedAt).toLocaleDateString() : v.rejectedAt ? new Date(v.rejectedAt).toLocaleDateString() : '—'}</span></li>
            <li><span className="text-gray-600">Expires:</span> <span className="text-gray-700">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : '—'}</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

const DOC_TYPES = ['PASSPORT', 'PHOTO', 'ID_CARD', 'BANK_STATEMENT', 'INVITATION', 'VACCINATION', 'SUPPORTING', 'OTHER'];


function TimelineTab({ v }: { v: any }) {
  const events: any[] = Array.isArray(v.timeline)
    ? v.timeline
    : Array.isArray(v.statusHistory)
      ? v.statusHistory
      : Array.isArray(v.submissions)
        ? v.submissions
        : [];

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Activity className="h-4 w-4" /> Timeline ({events.length})
        </h3>
      </div>
      {events.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-600">No timeline events yet — submissions and status changes will appear here</div>
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
                    <p className="text-xs text-gray-600">
                      {at ? new Date(at).toLocaleString() : '—'}
                    </p>
                  </div>
                  {note && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{note}</p>}
                  {actor && <p className="text-xs text-gray-600 mt-0.5">by {actor}</p>}
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
      <dt className="text-xs font-semibold text-gray-600">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value ?? '—'}</dd>
    </div>
  );
}

function EditTab({ v, refetch }: { v: any; refetch: () => void }) {
  const router = useRouter();
  const update = useUpdateVisa();
  const remove = useDeleteVisa();
  const submit = useSubmitVisa();
  const approve = useApproveVisa();
  const reject = useRejectVisa();

  const decide = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast.success(done);
      refetch();
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'That decision could not be recorded.'));
    }
  };

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
      toast.error(apiErrorMessage(e, 'Failed'));
    }
  };

  const archive = async () => {
    if (!confirm('Archive this visa application? You can re-activate it later.')) return;
    try {
      await remove.mutateAsync(v.id);
      toast.success('Visa application archived');
      router.push('/compliance');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed'));
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Decision</h3>
        <p className="text-xs text-gray-600">
          Each decision is recorded against this application with its own timestamp and
          notifies whoever filed it. Approving and rejecting need the manage permission.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="quiet" type="button" busy={submit.isPending}
            disabled={submit.isPending || ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(String(v.status))}
            onClick={() => decide(() => submit.mutateAsync(v.id), 'Application submitted')}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >Submit</Button>
          <Button variant="quiet" type="button" busy={approve.isPending}
            disabled={approve.isPending || String(v.status) === 'APPROVED'}
            onClick={() => {
              const visaNumber = window.prompt('Visa number (optional)') ?? undefined;
              return decide(() => approve.mutateAsync({ id: v.id, visaNumber: visaNumber || undefined }), 'Application approved');
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40"
          >Approve</Button>
          <Button variant="quiet" type="button" busy={reject.isPending}
            disabled={reject.isPending || String(v.status) === 'REJECTED'}
            onClick={() => {
              const reason = window.prompt('Reason for rejection');
              if (!reason) return;
              return decide(() => reject.mutateAsync({ id: v.id, reason }), 'Application rejected');
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
          >Reject</Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
          <Edit3 className="h-4 w-4" /> Edit application
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Status">
            <Select aria-label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {VISA_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </Select>
          </FormField>
          <FormField label="Visa type">
            <Select aria-label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {VISA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </FormField>
          <FormField label="Application number">
            <Input aria-label="Application Number" value={form.applicationNumber} onChange={(e) => setForm({ ...form, applicationNumber: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Regulatory system">
            <Select aria-label="Regulatory System" value={form.regulatorySystem} onChange={(e) => setForm({ ...form, regulatorySystem: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg bg-white outline-none focus:border-brand-400">
              {REGULATORY_SYSTEMS.map((s) => <option key={s} value={s}>{formatSystem(s)}</option>)}
            </Select>
          </FormField>
          <FormField label="Submitted at">
            <Input aria-label="Submitted At" type="datetime-local" value={form.submittedAt} onChange={(e) => setForm({ ...form, submittedAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Decision at">
            <Input aria-label="Decision At" type="datetime-local" value={form.decisionAt} onChange={(e) => setForm({ ...form, decisionAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Expires at">
            <Input aria-label="Expires At" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Rejection reason">
            <Input aria-label="Rejection Reason" value={form.rejectionReason} onChange={(e) => setForm({ ...form, rejectionReason: e.target.value })} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-400" />
          </FormField>
          <FormField label="Notes" full>
            <Textarea aria-label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none focus:border-brand-400" />
          </FormField>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="quiet" type="button" onClick={save} disabled={update.isPending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg disabled:opacity-50 hover:bg-brand-600">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save application
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-red-100 p-5">
        <h3 className="text-sm font-bold text-red-700 inline-flex items-center gap-2">
          <Trash2 className="h-4 w-4" /> Archive application
        </h3>
        <p className="text-xs text-gray-600 my-2">Removes the application from the active list. Past submissions are preserved.</p>
        <Button variant="quiet" type="button" onClick={archive} disabled={remove.isPending} className="px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg disabled:opacity-50">
          {remove.isPending ? 'Archiving…' : 'Archive'}
        </Button>
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
    NAHCON: 'NAHCON (Nigeria)',
    DIYANET: 'Diyanet (Türkiye)',
    TABUNG_HAJI: 'Tabung Haji (Malaysia)',
    MOTAC: 'MOTAC (Malaysia)',
    IBA_DGRP: 'IBA / DGRP',
    MANUAL: 'Manual / other',
  };
  return map[system] ?? system.replace(/_/g, ' ');
}

function toDateTimeLocal(value: string | Date): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
