'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, Lock, Send, AlertTriangle, CheckCircle2,
  XCircle, RotateCcw, Clock, User, Mail, Phone, MessageSquare, History, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useVisaRequest, useVisaRequestAssignees, useAssignVisaRequest, useChangeVisaRequestStatus,
  useAddVisaRequestNote, useEscalateVisaRequest, useResolveVisaRequest, useCloseVisaRequest,
  useReopenVisaRequest, useUpdateVisaRequest,
} from '@/hooks/use-visa-requests';
import {
  VISA_REQUEST_STATUS_META, VISA_REQUEST_PRIORITIES, VISA_REQUEST_PRIORITY_META,
  VISA_REQUEST_WORKFLOW_STATUSES, humanizeStatus,
} from '@/lib/statuses';

const apiError = (e: any) =>
  e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Action failed';

export function VisaRequestDetail({ id }: { id: string }) {
  const { data: t, isLoading, error, refetch } = useVisaRequest(id);
  const assigneesQ = useVisaRequestAssignees();

  const assign = useAssignVisaRequest();
  const changeStatus = useChangeVisaRequestStatus();
  const addNote = useAddVisaRequestNote();
  const escalate = useEscalateVisaRequest();
  const resolve = useResolveVisaRequest();
  const close = useCloseVisaRequest();
  const reopen = useReopenVisaRequest();
  const update = useUpdateVisaRequest();

  const [noteBody, setNoteBody] = useState('');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'PUBLIC'>('INTERNAL');
  const [reasonPrompt, setReasonPrompt] = useState<ReasonPrompt | null>(null);

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading ticket…
      </div>
    );
  }
  if (error || !t) {
    return (
      <div className="py-24 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500 mb-2">This service request could not be loaded</p>
        <Link href="/visa-requests" className="text-xs text-brand-500 hover:underline">Back to the queue</Link>
      </div>
    );
  }

  const st = VISA_REQUEST_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  const pr = VISA_REQUEST_PRIORITY_META[t.priority] ?? { label: t.priority, color: 'bg-gray-100 text-gray-600' };
  const isTerminal = t.status === 'RESOLVED' || t.status === 'CLOSED';

  return (
    <div className="space-y-5 pb-10">
      <Link href="/visa-requests" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Service requests
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-500">{t.ticketNumber}</span>
              <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', st.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', st.dot)} />{st.label}
              </span>
              <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', pr.color)}>{pr.label}</span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">{humanizeStatus(t.category)}</span>
              {t.isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                  <Clock className="h-3 w-3" /> Overdue
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-2">{t.subject}</h1>
            {t.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{t.description}</p>}
          </div>
        </div>

        {/* Workflow actions */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-50">
          {VISA_REQUEST_WORKFLOW_STATUSES.map((s) => (
            <button
              key={s}
              disabled={changeStatus.isPending || t.status === s || t.status === 'CLOSED'}
              onClick={() => run(() => changeStatus.mutateAsync({ id, status: s }), `Moved to ${VISA_REQUEST_STATUS_META[s].label}`)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              {VISA_REQUEST_STATUS_META[s].label}
            </button>
          ))}
          <button
            disabled={escalate.isPending || t.status === 'ESCALATED' || isTerminal}
            onClick={() => setReasonPrompt({
              title: 'Escalate ticket',
              label: 'Why is this being escalated?',
              placeholder: 'Applicant flies in 48 hours',
              cta: 'Escalate',
              required: true,
              onSubmit: (reason) => run(() => escalate.mutateAsync({ id, reason }), 'Ticket escalated'),
            })}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Escalate
          </button>
          <button
            disabled={resolve.isPending || t.status === 'RESOLVED' || t.status === 'CLOSED'}
            onClick={() => setReasonPrompt({
              title: 'Resolve ticket',
              label: 'How was this resolved?',
              placeholder: 'Filing submitted and acknowledged by Nusuk',
              cta: 'Resolve',
              required: true,
              onSubmit: (resolution) => run(() => resolve.mutateAsync({ id, resolution }), 'Ticket resolved'),
            })}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
          </button>
          <button
            disabled={close.isPending || t.status === 'CLOSED'}
            onClick={() => setReasonPrompt({
              title: 'Close ticket',
              label: 'Closing note (optional)',
              placeholder: 'Visa issued and collected',
              cta: 'Close ticket',
              required: false,
              onSubmit: (note) => run(() => close.mutateAsync({ id, note: note || undefined }), 'Ticket closed'),
            })}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <XCircle className="h-3.5 w-3.5" /> Close
          </button>
          <button
            disabled={reopen.isPending || !isTerminal}
            onClick={() => setReasonPrompt({
              title: 'Reopen ticket',
              label: 'Why is this being reopened?',
              placeholder: 'Requester reports the visa PDF is corrupt',
              cta: 'Reopen',
              required: true,
              onSubmit: (reason) => run(() => reopen.mutateAsync({ id, reason }), 'Ticket reopened'),
            })}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Conversation + timeline */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-500" /> Notes &amp; responses
            </h2>

            <div className="flex gap-1.5 mb-2">
              {(['INTERNAL', 'PUBLIC'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibility(v)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border font-medium transition-all inline-flex items-center gap-1.5',
                    visibility === v ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  {v === 'INTERNAL' ? <Lock className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                  {v === 'INTERNAL' ? 'Internal note' : 'Public response'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              {visibility === 'INTERNAL'
                ? 'Internal notes stay with the team — they are never shown to the requester.'
                : 'Public responses are visible to the requester and start the response clock.'}
            </p>

            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              aria-label="Note body"
              placeholder={visibility === 'INTERNAL' ? 'Context for the team…' : 'Reply to the requester…'}
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                disabled={addNote.isPending || !noteBody.trim()}
                onClick={() => run(async () => {
                  await addNote.mutateAsync({ id, body: noteBody.trim(), visibility });
                  setNoteBody('');
                }, visibility === 'INTERNAL' ? 'Internal note added' : 'Response sent')}
                className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {addNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {visibility === 'INTERNAL' ? 'Add note' : 'Send response'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {(t.notes ?? []).length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">
                  No notes yet — add an internal note for the team, or send the requester a public response.
                </p>
              ) : (t.notes ?? []).map((n: any) => (
                <div
                  key={n.id}
                  className={cn(
                    'rounded-xl border p-3',
                    n.visibility === 'INTERNAL' ? 'bg-amber-50/60 border-amber-100' : 'bg-white border-gray-100',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
                      n.visibility === 'INTERNAL' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700',
                    )}>
                      {n.visibility === 'INTERNAL' ? <Lock className="h-2.5 w-2.5" /> : <Send className="h-2.5 w-2.5" />}
                      {n.visibility === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'}
                    </span>
                    <span className="text-xs text-gray-500">{n.authorName ?? 'System'}</span>
                    <span className="text-xs text-gray-500">· {new Date(n.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <History className="h-4 w-4 text-gray-500" /> Timeline
            </h2>
            <ol className="space-y-3">
              {(t.events ?? []).map((e: any) => (
                <li key={e.id} className="flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700">{e.message}</p>
                    <p className="text-xs text-gray-500">
                      {e.type} · {new Date(e.createdAt).toLocaleString()}{e.actorEmail ? ` · ${e.actorEmail}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Ticket</h2>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Assignee</span>
              <select
                value={t.assigneeId ?? ''}
                aria-label="Assignee"
                disabled={assign.isPending}
                onChange={(e) => run(() => assign.mutateAsync({ id, assigneeId: e.target.value || null }), 'Assignee updated')}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
              >
                <option value="">Unassigned</option>
                {(assigneesQ.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Priority</span>
              <select
                value={t.priority}
                aria-label="Priority"
                disabled={update.isPending}
                onChange={(e) => run(() => update.mutateAsync({ id, priority: e.target.value }), 'Priority updated')}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
              >
                {VISA_REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{VISA_REQUEST_PRIORITY_META[p].label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Due date</span>
              <input
                type="date"
                aria-label="Due date"
                defaultValue={t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : ''}
                onChange={(e) => run(
                  () => update.mutateAsync({ id, dueAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }),
                  'Due date updated',
                )}
                className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
              />
            </label>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Requester</h2>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-gray-700"><User className="h-3.5 w-3.5 text-gray-500" /> {t.requesterName ?? '—'}</p>
              <p className="flex items-center gap-2 text-gray-700"><Mail className="h-3.5 w-3.5 text-gray-500" /> {t.requesterEmail ?? '—'}</p>
              <p className="flex items-center gap-2 text-gray-700"><Phone className="h-3.5 w-3.5 text-gray-500" /> {t.requesterPhone ?? '—'}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Lifecycle</h2>
            <dl className="space-y-1.5 text-xs">
              <Row label="Created" value={new Date(t.createdAt).toLocaleString()} />
              <Row label="First response" value={t.firstResponseAt ? new Date(t.firstResponseAt).toLocaleString() : '—'} />
              <Row label="Escalated" value={t.escalatedAt ? new Date(t.escalatedAt).toLocaleString() : '—'} />
              <Row label="Resolved" value={t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : '—'} />
              <Row label="Closed" value={t.closedAt ? new Date(t.closedAt).toLocaleString() : '—'} />
              <Row label="Reopened" value={t.reopenCount > 0 ? `${t.reopenCount}×` : '—'} />
            </dl>
            {t.escalationReason && (
              <p className="text-xs text-red-600 mt-3 bg-red-50 rounded-lg p-2">
                <span className="font-semibold">Escalation:</span> {t.escalationReason}
              </p>
            )}
            {t.resolution && (
              <p className="text-xs text-green-700 mt-2 bg-green-50 rounded-lg p-2">
                <span className="font-semibold">Resolution:</span> {t.resolution}
              </p>
            )}
          </div>
        </div>
      </div>

      {reasonPrompt && (
        <ReasonModal
          prompt={reasonPrompt}
          onClose={() => setReasonPrompt(null)}
          onSubmit={async (value) => { await reasonPrompt.onSubmit(value); setReasonPrompt(null); }}
        />
      )}
    </div>
  );
}

interface ReasonPrompt {
  title: string;
  label: string;
  placeholder: string;
  cta: string;
  required: boolean;
  onSubmit: (value: string) => Promise<void> | void;
}

/**
 * Shared reason capture for escalate / resolve / close / reopen. A real
 * dialog rather than window.prompt so it matches the rest of the app and
 * stays keyboard- and screen-reader-accessible.
 */
function ReasonModal({
  prompt, onClose, onSubmit,
}: { prompt: ReasonPrompt; onClose: () => void; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const invalid = prompt.required && value.trim().length < 3;

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    try { await onSubmit(value.trim()); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={prompt.title} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900">{prompt.title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">
            {prompt.label}{prompt.required ? ' *' : ''}
          </span>
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            aria-label={prompt.label}
            placeholder={prompt.placeholder}
            className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
          />
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || invalid}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {prompt.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-700 text-right">{value}</dd>
    </div>
  );
}
