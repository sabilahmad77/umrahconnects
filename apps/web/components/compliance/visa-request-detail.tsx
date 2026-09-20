'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Lock, Send, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Clock, User, Mail, Phone, MessageSquare, History, Pencil, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, LoadingState, ModalSurface, QueryFailure, Select, Textarea } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useVisaRequest, useVisaRequestAssignees, useAssignVisaRequest, useChangeVisaRequestStatus,
  useAddVisaRequestNote, useEscalateVisaRequest, useResolveVisaRequest, useCloseVisaRequest,
  useReopenVisaRequest, useUpdateVisaRequest, useDeleteVisaRequest,
} from '@/hooks/use-visa-requests';
import {
  VISA_REQUEST_STATUS_META, VISA_REQUEST_PRIORITIES, VISA_REQUEST_PRIORITY_META, VISA_REQUEST_CATEGORIES,
  VISA_REQUEST_WORKFLOW_STATUSES, humanizeStatus,
} from '@/lib/statuses';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { ModalFooter, ModalHeader, dateTime } from '@/components/dashboard/workflow-ui';
import { FormField } from '@/components/hotels/hotel-form';
import { cn } from '@/lib/utils';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function VisaRequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: t, isLoading, error, refetch } = useVisaRequest(id);
  const { ready, can } = useCapabilities();
  const canWork = can('visa:application:submit');
  const canManage = can('visa:application:manage');
  const assigneesQ = useVisaRequestAssignees();

  const assign = useAssignVisaRequest();
  const changeStatus = useChangeVisaRequestStatus();
  const addNote = useAddVisaRequestNote();
  const escalate = useEscalateVisaRequest();
  const resolve = useResolveVisaRequest();
  const close = useCloseVisaRequest();
  const reopen = useReopenVisaRequest();
  const update = useUpdateVisaRequest();
  const remove = useDeleteVisaRequest();

  const [noteBody, setNoteBody] = useState('');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'PUBLIC'>('INTERNAL');
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<any>, okMsg: string) => {
    setBusy(key);
    try { await fn(); toast.success(okMsg); }
    catch (e: any) { toast.error(apiErrorMessage(e, 'That ticket action failed.')); throw e; }
    finally { setBusy(null); }
  };
  const quiet = (key: string, fn: () => Promise<any>, okMsg: string) => run(key, fn, okMsg).catch(() => undefined);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !t) return <LoadingState label="Loading ticket…" />;

  const st = VISA_REQUEST_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  const pr = VISA_REQUEST_PRIORITY_META[t.priority] ?? { label: t.priority, color: 'bg-gray-100 text-gray-600' };
  const terminal = t.status === 'RESOLVED' || t.status === 'CLOSED';
  const closed = t.status === 'CLOSED';
  const editable = canWork && !closed;

  return (
    <div className="space-y-5 pb-10">
      <Link href="/visa-requests" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-700"><ArrowLeft className="h-4 w-4" /> Service requests</Link>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-600">{t.ticketNumber}</span>
              <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', st.color)}><span className={cn('w-1.5 h-1.5 rounded-full', st.dot)} />{st.label}</span>
              <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', pr.color)}>{pr.label}</span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">{humanizeStatus(t.category)}</span>
              {t.isOverdue && <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-800"><Clock className="h-3 w-3" /> Overdue</span>}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-2">{t.subject}</h1>
            {t.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{t.description}</p>}
          </div>
          <div className="flex gap-2">
            {editable && <Button variant="secondary" type="button" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit details</Button>}
            {canManage && (
              <Button variant="quiet" type="button" className="text-red-700 hover:bg-red-50" onClick={() => setConfirm({
                title: `Delete ${t.ticketNumber}?`, body: 'The ticket, its notes and its timeline are deleted permanently. Close it instead if it only needs to be finished.',
                cta: 'Delete ticket', tone: 'danger', typeToConfirm: t.ticketNumber,
                onConfirm: async () => {
                  try { await remove.mutateAsync(t.id); toast.success('Ticket deleted'); router.push('/visa-requests'); }
                  catch (e) { toast.error(apiErrorMessage(e, 'The ticket could not be deleted.')); }
                },
              })}><Trash2 className="h-4 w-4" /> Delete</Button>
            )}
          </div>
        </div>

        {(canWork || canManage) && (
          <div role="group" className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100" aria-label="Ticket workflow">
            {canWork && !terminal && VISA_REQUEST_WORKFLOW_STATUSES.filter((s) => s !== t.status).map((s) => (
              <Button key={s} variant="secondary" type="button" busy={busy === s} disabled={!!busy} className="text-xs px-3 py-1.5 min-h-0"
                onClick={() => quiet(s, () => changeStatus.mutateAsync({ id, status: s }), `Moved to ${VISA_REQUEST_STATUS_META[s].label}`)}>
                {VISA_REQUEST_STATUS_META[s].label}
              </Button>
            ))}
            {canManage && !terminal && t.status !== 'ESCALATED' && (
              <Button variant="secondary" type="button" disabled={!!busy} className="text-xs px-3 py-1.5 min-h-0 text-red-700"
                onClick={() => setReasonPrompt({ title: 'Escalate ticket', label: 'Why is this being escalated?', placeholder: 'Applicant flies in 48 hours', cta: 'Escalate', required: true,
                  onSubmit: (reason) => run('ESCALATE', () => escalate.mutateAsync({ id, reason }), 'Ticket escalated') })}>
                <AlertTriangle className="h-3.5 w-3.5" /> Escalate
              </Button>
            )}
            {canWork && !terminal && (
              <Button variant="secondary" type="button" disabled={!!busy} className="text-xs px-3 py-1.5 min-h-0 text-green-800"
                onClick={() => setReasonPrompt({ title: 'Resolve ticket', label: 'How was this resolved?', placeholder: 'Filing submitted and acknowledged', cta: 'Resolve', required: true,
                  onSubmit: (resolution) => run('RESOLVE', () => resolve.mutateAsync({ id, resolution }), 'Ticket resolved') })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
              </Button>
            )}
            {canManage && !closed && (
              <Button variant="secondary" type="button" disabled={!!busy} className="text-xs px-3 py-1.5 min-h-0"
                onClick={() => setReasonPrompt({ title: 'Close ticket', label: 'Closing note (optional)', placeholder: 'Visa issued and collected', cta: 'Close ticket', required: false,
                  onSubmit: (note) => run('CLOSE', () => close.mutateAsync({ id, note: note || undefined }), 'Ticket closed') })}>
                <XCircle className="h-3.5 w-3.5" /> Close
              </Button>
            )}
            {canManage && terminal && (
              <Button variant="secondary" type="button" disabled={!!busy} className="text-xs px-3 py-1.5 min-h-0 text-brand-700"
                onClick={() => setReasonPrompt({ title: 'Reopen ticket', label: 'Why is this being reopened?', placeholder: 'Requester reports the visa PDF is corrupt', cta: 'Reopen', required: true,
                  onSubmit: (reason) => run('REOPEN', () => reopen.mutateAsync({ id, reason }), 'Ticket reopened') })}>
                <RotateCcw className="h-3.5 w-3.5" /> Reopen
              </Button>
            )}
          </div>
        )}
        {terminal && canWork && !canManage && <p className="text-xs text-gray-600 mt-3">This ticket is {st.label.toLowerCase()}; a visa manager can reopen it.</p>}
      </div>
      {ready && !canWork && <ReadOnlyNotice>You can follow this ticket. Working on it needs the visa submission permission.</ReadOnlyNotice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><MessageSquare className="h-4 w-4 text-gray-600" /> Notes &amp; responses</h2>
            {editable ? (
              <form noValidate onSubmit={(e) => { e.preventDefault(); if (noteBody.trim()) quiet('NOTE', async () => { await addNote.mutateAsync({ id, body: noteBody.trim(), visibility }); setNoteBody(''); }, visibility === 'INTERNAL' ? 'Internal note added' : 'Response sent'); }}>
                <div className="flex gap-1.5 mb-2" role="radiogroup" aria-label="Note visibility">
                  {(['INTERNAL', 'PUBLIC'] as const).map((v) => (
                    <Button variant="quiet" type="button" role="radio" aria-checked={visibility === v} key={v} onClick={() => setVisibility(v)}
                      className={cn('text-xs px-3 py-1.5 rounded-full border font-medium inline-flex items-center gap-1.5', visibility === v ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {v === 'INTERNAL' ? <Lock className="h-3 w-3" /> : <Send className="h-3 w-3" />}{v === 'INTERNAL' ? 'Internal note' : 'Public response'}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mb-2">{visibility === 'INTERNAL' ? 'Internal notes stay with the team — they are never shown to the requester.' : 'Public responses are visible to the requester and start the response clock.'}</p>
                <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} aria-label="Note" maxLength={5000} placeholder={visibility === 'INTERNAL' ? 'Context for the team…' : 'Reply to the requester…'} />
                <div className="flex justify-end mt-2"><Button type="submit" busy={busy === 'NOTE'} disabled={!noteBody.trim()}><Send className="h-3.5 w-3.5" /> {visibility === 'INTERNAL' ? 'Add note' : 'Send response'}</Button></div>
              </form>
            ) : closed ? <p className="text-xs text-gray-600">The ticket is closed; reopen it to add notes.</p> : null}
            <div className="mt-4 space-y-3">
              {(t.notes ?? []).length === 0 ? <p className="text-xs text-gray-600 py-4 text-center">No notes yet.</p> : (t.notes ?? []).map((n: any) => (
                <div key={n.id} className={cn('rounded-xl border p-3', n.visibility === 'INTERNAL' ? 'bg-amber-50/60 border-amber-100' : 'bg-white border-gray-200')}>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full', n.visibility === 'INTERNAL' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800')}>
                      {n.visibility === 'INTERNAL' ? <Lock className="h-2.5 w-2.5" /> : <Send className="h-2.5 w-2.5" />}{n.visibility === 'INTERNAL' ? 'Internal' : 'Public'}
                    </span>
                    <span className="text-xs text-gray-600">{n.authorName ?? 'System'} · {dateTime(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><History className="h-4 w-4 text-gray-600" /> Timeline</h2>
            <ol className="space-y-3">
              {(t.events ?? []).map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <span aria-hidden="true" className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                  <div className="min-w-0"><p className="text-sm text-gray-700">{e.message}</p><p className="text-xs text-gray-600">{humanizeStatus(e.type)} · {dateTime(e.createdAt)}{e.actorEmail ? ` · ${e.actorEmail}` : ''}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Ticket</h2>
            <FormField label="Assignee" hint={canManage ? undefined : 'Assigned by a visa manager'}>{(p) => canManage && !closed ? (
              <Select {...p} value={t.assigneeId ?? ''} disabled={busy === 'ASSIGN'} onChange={(e) => quiet('ASSIGN', () => assign.mutateAsync({ id, assigneeId: e.target.value || null }), 'Assignee updated')}>
                <option value="">Unassigned</option>
                {(assigneesQ.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            ) : <p {...p} className="text-sm text-gray-900">{t.assigneeName ?? 'Unassigned'}</p>}</FormField>
            <FormField label="Priority">{(p) => editable ? (
              <Select {...p} value={t.priority} disabled={busy === 'PRIORITY'} onChange={(e) => quiet('PRIORITY', () => update.mutateAsync({ id, priority: e.target.value }), 'Priority updated')}>
                {VISA_REQUEST_PRIORITIES.map((x) => <option key={x} value={x}>{VISA_REQUEST_PRIORITY_META[x].label}</option>)}
              </Select>
            ) : <p {...p} className="text-sm text-gray-900">{pr.label}</p>}</FormField>
            <FormField label="Due date">{(p) => editable ? (
              <div className="flex gap-2">
                <Input {...p} type="date" key={t.dueAt ?? 'none'} defaultValue={t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : ''}
                  onChange={(e) => e.target.value && quiet('DUE', () => update.mutateAsync({ id, dueAt: new Date(`${e.target.value}T12:00:00Z`).toISOString() }), 'Due date updated')} />
                {t.dueAt && <Button variant="quiet" type="button" className="text-xs text-gray-700 hover:underline" busy={busy === 'DUE'} onClick={() => quiet('DUE', () => update.mutateAsync({ id, dueAt: null }), 'Due date cleared')}>Clear</Button>}
              </div>
            ) : <p {...p} className="text-sm text-gray-900">{t.dueAt ? new Date(t.dueAt).toLocaleDateString('en-GB') : 'No due date'}</p>}</FormField>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Requester</h2>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-gray-700"><User className="h-3.5 w-3.5 text-gray-600" /> {t.requesterName ?? '—'}</p>
              <p className="flex items-center gap-2 text-gray-700"><Mail className="h-3.5 w-3.5 text-gray-600" /> {t.requesterEmail ?? '—'}</p>
              <p className="flex items-center gap-2 text-gray-700"><Phone className="h-3.5 w-3.5 text-gray-600" /> {t.requesterPhone ?? '—'}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Lifecycle</h2>
            <dl className="space-y-1.5 text-xs">
              <Row label="Created" value={dateTime(t.createdAt)} />
              <Row label="First response" value={t.firstResponseAt ? dateTime(t.firstResponseAt) : '—'} />
              <Row label="Escalated" value={t.escalatedAt ? dateTime(t.escalatedAt) : '—'} />
              <Row label="Resolved" value={t.resolvedAt ? dateTime(t.resolvedAt) : '—'} />
              <Row label="Closed" value={t.closedAt ? dateTime(t.closedAt) : '—'} />
              <Row label="Reopened" value={t.reopenCount > 0 ? `${t.reopenCount}×` : '—'} />
            </dl>
            {t.escalationReason && <p className="text-xs text-red-700 mt-3 bg-red-50 rounded-lg p-2"><span className="font-semibold">Escalation:</span> {t.escalationReason}</p>}
            {t.resolution && <p className="text-xs text-green-800 mt-2 bg-green-50 rounded-lg p-2"><span className="font-semibold">Resolution:</span> {t.resolution}</p>}
          </div>
        </div>
      </div>

      {reasonPrompt && <ReasonModal prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} />}
      {editing && <EditTicketModal ticket={t} onClose={() => setEditing(false)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

interface ReasonPrompt {
  title: string; label: string; placeholder: string; cta: string; required: boolean;
  onSubmit: (value: string) => Promise<unknown>;
}

/** Reason capture for escalate / resolve / close / reopen; stays open with the error if the server refuses. */
function ReasonModal({ prompt, onClose }: { prompt: ReasonPrompt; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const invalid = prompt.required && value.trim().length < 3;
  const submit = async () => {
    if (invalid || busy) return;
    setBusy(true);
    try { await prompt.onSubmit(value.trim()); onClose(); } catch { /* the error toast is already shown */ } finally { setBusy(false); }
  };
  return (
    <ModalSurface busy={busy} title={prompt.title} onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }} className="bg-white rounded-xl w-full max-w-md p-5 shadow-xl">
        <ModalHeader title={prompt.title} onClose={onClose} busy={busy} />
        <FormField label={`${prompt.label}${prompt.required ? ' *' : ''}`} hint={prompt.required ? 'At least 3 characters' : undefined}>{(p) => <Textarea {...p} autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={2000} placeholder={prompt.placeholder} />}</FormField>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" busy={busy} disabled={invalid}>{prompt.cta}</Button>
        </div>
      </form>
    </ModalSurface>
  );
}

function EditTicketModal({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const update = useUpdateVisaRequest();
  const [form, setForm] = useState({
    subject: ticket.subject ?? '', description: ticket.description ?? '', category: ticket.category ?? 'OTHER',
    requesterName: ticket.requesterName ?? '', requesterEmail: ticket.requesterEmail ?? '', requesterPhone: ticket.requesterPhone ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errors: Record<string, string> = {};
  if (form.subject.trim().length < 3) errors.subject = 'At least 3 characters.';
  if (form.requesterEmail.trim() && !EMAIL.test(form.requesterEmail.trim())) errors.requesterEmail = 'Enter a valid email address.';
  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || update.isPending) return;
    setServerError('');
    try {
      await update.mutateAsync({
        id: ticket.id, subject: form.subject.trim(), description: form.description.trim(), category: form.category,
        requesterName: form.requesterName.trim(), requesterEmail: form.requesterEmail.trim() || null, requesterPhone: form.requesterPhone.trim(),
      });
      toast.success('Ticket saved');
      onClose();
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The ticket could not be saved.'));
    }
  };
  const err = touched ? errors : {};
  return (
    <ModalSurface busy={update.isPending} title="Edit ticket" onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title={`Edit ${ticket.ticketNumber}`} onClose={onClose} busy={update.isPending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Subject *" error={err.subject} full>{(p) => <Input {...p} value={form.subject} onChange={set('subject')} maxLength={200} />}</FormField>
          <FormField label="Description" full>{(p) => <Textarea {...p} rows={3} value={form.description} onChange={set('description')} maxLength={5000} />}</FormField>
          <FormField label="Category">{(p) => <Select {...p} value={form.category} onChange={set('category')}>{VISA_REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{humanizeStatus(c)}</option>)}</Select>}</FormField>
          <FormField label="Requester name">{(p) => <Input {...p} value={form.requesterName} onChange={set('requesterName')} />}</FormField>
          <FormField label="Requester email" error={err.requesterEmail}>{(p) => <Input {...p} type="email" value={form.requesterEmail} onChange={set('requesterEmail')} />}</FormField>
          <FormField label="Requester phone">{(p) => <Input {...p} type="tel" value={form.requesterPhone} onChange={set('requesterPhone')} />}</FormField>
        </div>
        <ModalFooter onClose={onClose} pending={update.isPending} cta="Save ticket" />
      </form>
    </ModalSurface>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-gray-600">{label}</dt><dd className="text-gray-700 text-right">{value}</dd></div>;
}
