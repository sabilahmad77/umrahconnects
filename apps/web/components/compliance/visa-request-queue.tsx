'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Inbox, Plus, RefreshCw, Search, X, Loader2, AlertCircle, AlertTriangle,
  UserPlus, Clock, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useVisaRequests, useVisaRequestStats, useVisaRequestAssignees, useCreateVisaRequest,
} from '@/hooks/use-visa-requests';
import {
  VISA_REQUEST_STATUSES, VISA_REQUEST_STATUS_META, VISA_REQUEST_PRIORITIES,
  VISA_REQUEST_PRIORITY_META, VISA_REQUEST_CATEGORIES, humanizeStatus,
} from '@/lib/statuses';

const STATUS_FILTERS = ['ALL', ...VISA_REQUEST_STATUSES] as const;

/**
 * The visa agency's service-ticket queue: category, priority, assignee, due
 * date and lifecycle live on the ticket itself. Distinct from a visa
 * application (the regulator filing) and from marketplace demand.
 */
export function VisaRequestQueue() {
  const [status, setStatus] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const filters = {
    page,
    limit: 20,
    status: status !== 'ALL' ? status : undefined,
    q: q || undefined,
    overdue: overdueOnly ? 'true' : undefined,
  };
  const { data, isLoading, error, refetch } = useVisaRequests(filters);
  const { data: stats } = useVisaRequestStats();
  const assigneesQ = useVisaRequestAssignees();
  const createTicket = useCreateVisaRequest();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const statCards = [
    { label: 'Open',       value: stats?.open ?? 0,       color: 'text-blue-600',   Icon: Inbox },
    { label: 'Escalated',  value: stats?.byStatus?.ESCALATED ?? 0, color: 'text-red-500', Icon: AlertTriangle },
    { label: 'Overdue',    value: stats?.overdue ?? 0,    color: 'text-orange-600', Icon: Clock },
    { label: 'Unassigned', value: stats?.unassigned ?? 0, color: 'text-gray-600',   Icon: UserPlus },
  ];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa service requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total.toLocaleString()} ticket{total === 1 ? '' : 's'} · {stats?.closedOrResolved ?? 0} resolved or closed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            aria-label="Refresh tickets"
            className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
          >
            <Plus className="h-4 w-4" /> New request
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">{Number(s.value).toLocaleString()}</p>
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', s.color)}>
              <s.Icon className="h-3.5 w-3.5" /> {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300 transition-colors">
          <Search className="h-4 w-4 text-gray-500 shrink-0" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search ticket, subject or requester..."
            aria-label="Search visa service requests"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setStatus(f); setPage(1); }}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all font-medium',
                status === f ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
              )}
            >
              {f === 'ALL' ? 'All' : VISA_REQUEST_STATUS_META[f]?.label ?? f}
            </button>
          ))}
          <button
            onClick={() => { setOverdueOnly((v) => !v); setPage(1); }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-all font-medium inline-flex items-center gap-1',
              overdueOnly ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-500 hover:border-gray-300',
            )}
          >
            <Clock className="h-3 w-3" /> Overdue
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-gray-100 rounded" />
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                </div>
                <div className="h-6 w-24 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
            <p className="text-sm text-red-500 mb-2">Failed to load service requests</p>
            <button onClick={() => refetch()} className="text-xs text-brand-500 hover:underline">Retry</button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center px-6">
            <Inbox className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-semibold text-gray-700">No service requests yet</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Raise a ticket when a pilgrim or operator needs something from the visa desk — a document
              re-scan, an urgent filing, a status chase. Assign it, set a due date, and the timeline
              records every step.
            </p>
            <button onClick={() => setShowCreate(true)} className="text-xs text-brand-500 hover:underline mt-3 inline-block">
              Create the first request →
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Ticket</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">Priority</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Assignee</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((t: any) => {
                  const st = VISA_REQUEST_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  const pr = VISA_REQUEST_PRIORITY_META[t.priority] ?? { label: t.priority, color: 'bg-gray-100 text-gray-600' };
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/visa-requests/${t.id}`} className="block hover:underline">
                          <p className="text-sm font-semibold text-gray-800">{t.subject}</p>
                          <p className="text-xs text-gray-500 font-mono">
                            {t.ticketNumber} · {humanizeStatus(t.category)}
                            {t.requesterName ? ` · ${t.requesterName}` : ''}
                          </p>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', st.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', st.dot)} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', pr.color)}>{pr.label}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className="text-sm text-gray-600">{t.assigneeName ?? <span className="text-gray-500">Unassigned</span>}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        {t.dueAt ? (
                          <span className={cn('text-sm', t.isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600')}>
                            {new Date(t.dueAt).toLocaleDateString()}
                            {t.isOverdue && ' · overdue'}
                          </span>
                        ) : <span className="text-sm text-gray-500">—</span>}
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
        <NewRequestModal
          assignees={assigneesQ.data ?? []}
          pending={createTicket.isPending}
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try {
              await createTicket.mutateAsync(dto);
              toast.success('Service request created');
              setShowCreate(false);
              refetch();
            } catch (e: any) {
              toast.error(e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Failed to create request');
            }
          }}
        />
      )}
    </div>
  );
}

function NewRequestModal({
  assignees, onClose, onCreate, pending,
}: {
  assignees: { id: string; name: string; email: string }[];
  onClose: () => void;
  onCreate: (dto: any) => Promise<void>;
  pending: boolean;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('NEW_APPLICATION');
  const [priority, setPriority] = useState<string>('NORMAL');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [touched, setTouched] = useState(false);

  const subjectError = touched && subject.trim().length < 3 ? 'Subject must be at least 3 characters' : '';

  const submit = () => {
    setTouched(true);
    if (subject.trim().length < 3) return;
    return onCreate({
      subject: subject.trim(),
      description: description || undefined,
      category,
      priority,
      requesterName: requesterName || undefined,
      requesterEmail: requesterEmail || undefined,
      assigneeId: assigneeId || undefined,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New visa service request" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New service request</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Subject *</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!subjectError}
              aria-label="Subject"
              placeholder="Passport rejected — needs re-scan"
              className={cn(
                'w-full text-sm px-3 py-2.5 border rounded-lg outline-none',
                subjectError ? 'border-red-400' : 'border-gray-200',
              )}
            />
            {subjectError && <span role="alert" className="text-xs text-red-500 mt-1 block">{subjectError}</span>}
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              aria-label="Description"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                {VISA_REQUEST_CATEGORIES.map((c) => <option key={c} value={c}>{humanizeStatus(c)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                {VISA_REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{VISA_REQUEST_PRIORITY_META[p].label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Requester name</span>
              <input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} aria-label="Requester name" placeholder="Fatima Al-Zahrani" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Requester email</span>
              <input value={requesterEmail} onChange={(e) => setRequesterEmail(e.target.value)} aria-label="Requester email" placeholder="name@example.com" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Assign to</span>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assign to" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white">
                <option value="">Unassigned</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 mb-1">Due date</span>
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-label="Due date" className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={submit} disabled={pending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Create request
          </button>
        </div>
      </div>
    </div>
  );
}
