'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileCheck2, ListChecks, Activity, Save, CheckCircle2, XCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, LoadingState, ModalSurface, QueryFailure, Textarea } from '@/components/ui/system';
import { tablistKeys } from '@/components/ui/tablist';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  VISA_TERMINAL_STATUSES, useApproveVisa, useCancelVisa, useRejectVisa, useSubmitVisa, useUpdateVisa, useVisa,
} from '@/hooks/use-visa';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { ModalFooter, ModalHeader, dateTime, humanize, sar, shortDate } from '@/components/dashboard/workflow-ui';
import { FormField } from '@/components/hotels/hotel-form';
import { PaymentBadge } from '@/components/hotels/hotel-ui';
import { cn } from '@/lib/utils';
import { VisaDocumentPanel } from './visa-document-panel';
import { VisaStatusBadge, applicantOf } from './compliance-list';
import { SYSTEM_LABEL, VisaFormFields, visaFormErrors, visaFormFromVisa, visaPayload, type VisaForm } from './visa-form';

type TabKey = 'overview' | 'documents' | 'timeline' | 'edit';
const TAB_LABEL: Record<TabKey, string> = { overview: 'Overview', documents: 'Documents', timeline: 'Timeline', edit: 'Edit' };

export function VisaDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, isLoading, error, refetch } = useVisa(id);
  const { ready, can } = useCapabilities();
  const [tab, setTab] = useState<TabKey>('overview');

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !v) return <LoadingState label="Loading visa application…" />;

  const canSubmit = can('visa:application:submit');
  const canManage = can('visa:application:manage');
  const closed = VISA_TERMINAL_STATUSES.includes(v.status);
  const tabs: TabKey[] = ['overview', 'documents', 'timeline', ...(canSubmit && !closed ? (['edit'] as TabKey[]) : [])];

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="quiet" type="button" aria-label="Back to applications" onClick={() => router.push('/compliance')} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50"><ArrowLeft className="h-4 w-4 text-gray-600" /></Button>
        <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center"><FileCheck2 className="h-6 w-6 text-green-800" /></div>
        <div className="flex-1 min-w-0 basis-[calc(100%_-_140px)] sm:basis-auto">
          <h1 className="text-2xl font-bold text-gray-900">{applicantOf(v)}</h1>
          <p className="text-sm text-gray-600">{v.applicationNumber ?? 'No application number'} · {v.visaType ?? 'Visa type not set'} · {SYSTEM_LABEL[v.regulatorySystem] ?? humanize(v.regulatorySystem)}</p>
        </div>
        <VisaStatusBadge status={v.status} />
      </div>

      <WorkflowBar v={v} canSubmit={canSubmit} canManage={canManage} />
      {ready && !canSubmit && <ReadOnlyNotice>You can view this application. Working on it needs the visa submission permission.</ReadOnlyNotice>}
      {closed && <ReadOnlyNotice>This application is {humanize(v.status).toLowerCase()} and closed; its history stays on record.</ReadOnlyNotice>}

      <div role="tablist" {...tablistKeys()} aria-label="Application sections" className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Button variant="quiet" type="button" role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}
            className={cn('px-3 py-2 rounded-xl text-sm font-medium', tab === t ? 'bg-brand-50 text-brand-700 border border-brand-100' : 'text-gray-600 hover:bg-gray-50')}>{TAB_LABEL[t]}</Button>
        ))}
      </div>

      {tab === 'overview' && <Overview v={v} canOpenTraveler={can('crm:pilgrim:read')} />}
      {tab === 'documents' && <VisaDocumentPanel visaId={v.id} locked={v.status === 'CANCELLED'} />}
      {tab === 'timeline' && <Timeline v={v} />}
      {tab === 'edit' && canSubmit && !closed && <EditTab v={v} canManage={canManage} />}
    </div>
  );
}

/** The next steps the server allows for this application, filtered by what this account may do. */
function WorkflowBar({ v, canSubmit, canManage }: { v: any; canSubmit: boolean; canManage: boolean }) {
  const submit = useSubmitVisa();
  const update = useUpdateVisa();
  const cancel = useCancelVisa();
  const [busy, setBusy] = useState<string | null>(null);
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [problem, setProblem] = useState('');
  const moves: string[] = v.allowedTransitions ?? [];

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setProblem('');
    try { await fn(); toast.success(done); }
    catch (e) { setProblem(apiErrorMessage(e, 'That step could not be recorded.')); }
    finally { setBusy(null); }
  };

  const buttons: { key: string; label: string; icon?: any; tone?: 'primary' | 'secondary' | 'danger'; onClick: () => void }[] = [];
  if (canSubmit && moves.includes('SUBMITTED')) buttons.push({ key: 'SUBMITTED', label: 'Submit application', icon: Send, tone: 'primary', onClick: () => run('SUBMITTED', () => submit.mutateAsync(v.id), 'Application submitted') });
  if (canManage && moves.includes('APPROVED')) buttons.push({ key: 'APPROVED', label: 'Approve', icon: CheckCircle2, tone: 'primary', onClick: () => setDecision('APPROVED') });
  if (canManage && moves.includes('REJECTED')) buttons.push({ key: 'REJECTED', label: 'Reject', icon: XCircle, tone: 'danger', onClick: () => setDecision('REJECTED') });
  if (canSubmit && moves.includes('UNDER_REVIEW')) buttons.push({ key: 'UNDER_REVIEW', label: 'Mark under review', onClick: () => run('UNDER_REVIEW', () => update.mutateAsync({ id: v.id, status: 'UNDER_REVIEW' }), 'Marked under review') });
  if (canSubmit && moves.includes('DOCUMENTS_COLLECTING')) buttons.push({
    key: 'DOCUMENTS_COLLECTING', label: v.status === 'NOT_STARTED' ? 'Start collecting documents' : 'Return for documents',
    onClick: () => run('DOCUMENTS_COLLECTING', () => update.mutateAsync({ id: v.id, status: 'DOCUMENTS_COLLECTING' }), 'Collecting documents'),
  });
  if (canSubmit && moves.includes('NOT_STARTED')) buttons.push({ key: 'NOT_STARTED', label: 'Back to not started', onClick: () => run('NOT_STARTED', () => update.mutateAsync({ id: v.id, status: 'NOT_STARTED' }), 'Moved back to not started') });
  if (canSubmit && moves.includes('EXPIRED')) buttons.push({
    key: 'EXPIRED', label: 'Mark visa expired',
    onClick: () => setConfirm({ title: 'Mark this visa expired?', body: 'The application is closed as expired. This cannot be undone.', cta: 'Mark expired', tone: 'danger', onConfirm: () => run('EXPIRED', () => update.mutateAsync({ id: v.id, status: 'EXPIRED' }), 'Marked expired') }),
  });
  if (canSubmit && moves.includes('CANCELLED')) buttons.push({
    key: 'CANCELLED', label: 'Cancel application', tone: 'danger',
    onClick: () => setConfirm({ title: 'Cancel this application?', body: 'The application is withdrawn and closed; its documents and timeline stay on record. This cannot be undone.', cta: 'Cancel application', tone: 'danger', onConfirm: () => run('CANCELLED', () => cancel.mutateAsync(v.id), 'Application cancelled') }),
  });

  const decisionsWaiting = (moves.includes('APPROVED') || moves.includes('REJECTED')) && !canManage;
  if (!buttons.length && !decisionsWaiting) return null;
  return (
    <section aria-label="Next steps" className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <Button key={b.key} type="button" variant={b.tone === 'primary' ? 'primary' : b.tone === 'danger' ? 'danger' : 'secondary'} busy={busy === b.key} disabled={!!busy} onClick={b.onClick}>
            {b.icon && <b.icon className="h-4 w-4" />} {b.label}
          </Button>
        ))}
      </div>
      {decisionsWaiting && <p className="text-xs text-gray-600">Approving or rejecting is done by an officer with the visa decision permission.</p>}
      {problem && <Alert title={problem} />}
      {decision && <DecisionModal v={v} decision={decision} onClose={() => setDecision(null)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </section>
  );
}

function DecisionModal({ v, decision, onClose }: { v: any; decision: 'APPROVED' | 'REJECTED'; onClose: () => void }) {
  const approve = useApproveVisa();
  const reject = useRejectVisa();
  const pending = approve.isPending || reject.isPending;
  const [visaNumber, setVisaNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const errors: Record<string, string> = {};
  if (decision === 'APPROVED') {
    if (!visaNumber.trim()) errors.visaNumber = 'Enter the visa number issued by the regulator.';
    else if (visaNumber.trim().length > 100) errors.visaNumber = 'At most 100 characters.';
    if (expiresAt && expiresAt <= today) errors.expiresAt = 'The expiry date must be in the future.';
  } else if (reason.trim().length < 3) errors.reason = 'Give the reason (at least 3 characters).';

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || pending) return;
    setServerError('');
    try {
      if (decision === 'APPROVED') await approve.mutateAsync({ id: v.id, visaNumber: visaNumber.trim(), expiresAt: expiresAt || undefined });
      else await reject.mutateAsync({ id: v.id, reason: reason.trim() });
      toast.success(decision === 'APPROVED' ? 'Visa approved' : 'Application rejected');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The decision could not be recorded.'));
    }
  };
  const err = touched ? errors : {};
  const title = decision === 'APPROVED' ? 'Approve visa application' : 'Reject visa application';
  return (
    <ModalSurface busy={pending} title={title} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <ModalHeader title={title} onClose={onClose} busy={pending} />
        <p className="text-sm text-gray-600 mb-3">{applicantOf(v)} · {v.applicationNumber}. The decision is recorded against your account and the filer is notified.</p>
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        {decision === 'APPROVED' ? (
          <div className="space-y-3">
            <FormField label="Visa number *" error={err.visaNumber}>{(p) => <Input {...p} value={visaNumber} onChange={(e) => setVisaNumber(e.target.value)} autoFocus />}</FormField>
            <FormField label="Visa valid until" error={err.expiresAt}>{(p) => <Input {...p} type="date" min={today} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</FormField>
          </div>
        ) : (
          <FormField label="Reason for rejection *" error={err.reason}>{(p) => <Textarea {...p} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}</FormField>
        )}
        <ModalFooter onClose={onClose} pending={pending} cta={decision === 'APPROVED' ? 'Approve' : 'Reject application'} danger={decision === 'REJECTED'} />
      </form>
    </ModalSurface>
  );
}

function Overview({ v, canOpenTraveler }: { v: any; canOpenTraveler: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2 space-y-3">
        <h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><ListChecks className="h-4 w-4" /> Application</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Passport" value={v.applicantPassport || v.pilgrim?.passportNumber || 'Missing'} />
          <Detail label="Nationality" value={v.applicantNationality || v.pilgrim?.nationality || 'Missing'} />
          <Detail label="Visa type" value={v.visaType || 'Not set'} />
          <Detail label="Regulatory system" value={SYSTEM_LABEL[v.regulatorySystem] ?? humanize(v.regulatorySystem)} />
          <Detail label="Destination" value={v.destinationCountry || '—'} />
          <Detail label="Assigned officer" value={v.assignedOfficer || '—'} />
          <Detail label="Expected completion" value={shortDate(v.expectedCompletionAt)} />
          <Detail label="Service fee" value={sar(v.priceCents, v.currency)} />
          <Detail label="Payment" value={<PaymentBadge status={v.paymentStatus} />} />
        </dl>
        {v.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap pt-2 border-t border-gray-100">{v.notes}</p>}
      </div>
      <div className="space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
          <p className="text-xs font-semibold text-gray-600">Decision</p>
          {v.status === 'APPROVED' || v.externalRef ? <p><span className="text-gray-600">Visa number:</span> <span className="font-mono font-semibold">{v.externalRef ?? '—'}</span></p> : null}
          {v.approvedAt && <p className="text-xs text-gray-700">Approved {dateTime(v.approvedAt)}</p>}
          {v.expiresAt && <p className="text-xs text-gray-700">Valid until {shortDate(v.expiresAt)}</p>}
          {v.rejectedAt && <p className="text-xs text-gray-700">Rejected {dateTime(v.rejectedAt)}</p>}
          {v.rejectionReason && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{v.rejectionReason}</p>}
          {!v.approvedAt && !v.rejectedAt && <p className="text-xs text-gray-600">No decision yet{v.submittedAt ? ` · submitted ${dateTime(v.submittedAt)}` : ''}.</p>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm">
          <p className="text-xs font-semibold text-gray-600 mb-1">Traveler record</p>
          {v.pilgrim ? (
            canOpenTraveler ? <Link href={`/pilgrims/${v.pilgrim.id}`} className="font-medium text-brand-700 hover:underline">{[v.pilgrim.firstNameEn, v.pilgrim.lastNameEn].filter(Boolean).join(' ') || 'Open traveler'}</Link>
              : <p className="font-medium text-gray-900">{[v.pilgrim.firstNameEn, v.pilgrim.lastNameEn].filter(Boolean).join(' ')}</p>
          ) : <p className="text-xs text-gray-600">External applicant — not linked to a traveler record.</p>}
          <p className="text-xs text-gray-600 mt-2">Created {dateTime(v.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs font-semibold text-gray-600">{label}</dt><dd className="text-sm text-gray-900 font-medium">{value}</dd></div>;
}

function Timeline({ v }: { v: any }) {
  const events: any[] = Array.isArray(v.timeline) ? [...v.timeline].reverse() : [];
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b border-gray-200"><h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Activity className="h-4 w-4" /> Timeline ({events.length})</h2></div>
      {events.length === 0 ? <p className="py-10 text-center text-sm text-gray-600">No events recorded yet.</p> : (
        <ol className="divide-y divide-gray-100">
          {events.map((e, i) => {
            const label = e.event === 'CREATED' ? 'Created' : e.event?.startsWith('STATUS_') ? humanize(e.to ?? e.event.slice(7)) : humanize(e.event);
            return (
              <li key={i} className="p-4 flex items-start gap-3">
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{label}{e.from ? <span className="text-xs text-gray-600 font-normal"> · from {humanize(e.from)}</span> : null}</p>
                    <p className="text-xs text-gray-600">{dateTime(e.at)}</p>
                  </div>
                  {e.visaNumber && <p className="text-xs text-gray-700 mt-0.5">Visa number {e.visaNumber}</p>}
                  {e.note && <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{e.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function EditTab({ v, canManage }: { v: any; canManage: boolean }) {
  const update = useUpdateVisa();
  const [form, setForm] = useState<VisaForm>(visaFormFromVisa(v));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors = visaFormErrors(form, { requireName: !v.pilgrimId });

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || update.isPending) return;
    setServerError('');
    try {
      await update.mutateAsync({ id: v.id, ...visaPayload(form, { includeRef: canManage, forUpdate: true }) });
      toast.success('Application saved');
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The application could not be saved.'));
    }
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 max-w-3xl">
      <h2 className="text-sm font-bold text-gray-900">Edit application</h2>
      {serverError && <Alert title={serverError} />}
      <VisaFormFields form={form} setForm={setForm} errors={touched ? errors : {}} isEdit canManage={canManage} />
      <p className="text-xs text-gray-600">Submission and decision dates, the rejection reason and payment status are recorded by their actions and are not edited here.</p>
      <div className="flex justify-end"><Button type="submit" busy={update.isPending}><Save className="h-4 w-4" /> Save application</Button></div>
    </form>
  );
}
