'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileCheck2, Plus, RefreshCw, Search, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api-error';
import { Alert, Button, Input, LoadingState, ModalSurface, QueryFailure, Select } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { usePilgrims } from '@/hooks/use-api';
import { VISA_STATUSES, VISA_STATUS_META, useCreateVisa, useVisaList, useVisaStats } from '@/hooks/use-visa';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { ModalFooter, ModalHeader, shortDate } from '@/components/dashboard/workflow-ui';
import { FormField } from '@/components/hotels/hotel-form';
import { cn } from '@/lib/utils';
import { VisaFormFields, emptyVisaForm, visaFormErrors, visaPayload, type VisaForm } from './visa-form';

const PAGE_SIZE = 20;

export function VisaStatusBadge({ status }: { status: string }) {
  const meta = VISA_STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap', meta.color)}>
      <span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
    </span>
  );
}

export const applicantOf = (v: any) =>
  v.applicantName || (v.pilgrim ? [v.pilgrim.firstNameEn, v.pilgrim.lastNameEn].filter(Boolean).join(' ') || v.pilgrim.firstNameAr : '') || 'Unnamed applicant';

export function ComplianceList() {
  const { ready, can } = useCapabilities();
  const canSubmit = can('visa:application:submit');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error, refetch } = useVisaList({
    page, limit: PAGE_SIZE, status: statusFilter !== 'ALL' ? statusFilter : undefined, search: search.trim() || undefined,
  });
  const stats = useVisaStats();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const s = stats.data;
  const cards = [
    { label: 'Approved', value: s?.byStatus?.APPROVED, color: 'text-green-800', Icon: CheckCircle2 },
    { label: 'Under review', value: s?.byStatus?.UNDER_REVIEW, color: 'text-orange-800', Icon: Clock },
    { label: 'Submitted', value: s?.byStatus?.SUBMITTED, color: 'text-blue-700', Icon: FileText },
    { label: 'Rejected', value: s?.byStatus?.REJECTED, color: 'text-red-700', Icon: XCircle },
  ];

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Visa & Compliance</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            {total.toLocaleString()} application{total === 1 ? '' : 's'}
            {s ? ` · ${s.decided ? `${Math.round(s.successRate * 100)}% of ${s.decided} decided applications approved` : 'no decisions yet'}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh applications" onClick={() => { refetch(); stats.refetch(); }} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600"><RefreshCw className="h-4 w-4" /></Button>
          {canSubmit && <Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New application</Button>}
        </div>
      </div>
      {ready && !canSubmit && <ReadOnlyNotice>You can view visa applications. Creating and submitting them needs the visa submission permission.</ReadOnlyNotice>}

      {stats.error ? <Alert title="Visa figures are unavailable">{apiErrorMessage(stats.error, 'Try refreshing.')}</Alert> : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{c.value ?? '—'}</p>
              <p className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', c.color)}><c.Icon className="h-3.5 w-3.5" /> {c.label}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">Regulator integrations (Nusuk / Masar, SISKOPATUH …) are planned: applications are tracked here and filed on the official portals, then the outcome is recorded with its visa number.</p>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-500 rounded-xl px-3 py-2.5 w-full lg:w-80">
          <Search className="h-4 w-4 text-gray-600 shrink-0" />
          <Input aria-label="Search applications" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Applicant, passport or application #" className="text-sm bg-transparent flex-1 outline-none border-0 p-0 min-h-0" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...VISA_STATUSES].map((f) => (
            <Button variant="quiet" type="button" key={f} aria-pressed={statusFilter === f} onClick={() => { setStatusFilter(f); setPage(1); }}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium', statusFilter === f ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
              {f === 'ALL' ? 'All' : VISA_STATUS_META[f]?.label ?? f}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {isLoading ? <LoadingState label="Loading applications…" /> : items.length === 0 ? (
          <div className="py-16 text-center">
            <FileCheck2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">No visa applications match this view</p>
          </div>
        ) : (
          <div role="region" aria-label="Visa applications" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                <tr><th className="text-left px-4 py-3">Applicant</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Passport</th><th className="text-left px-4 py-3">Visa</th><th className="text-left px-4 py-3">Submitted</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((v: any) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3">
                      <Link href={`/compliance/${v.id}`} className="font-semibold text-brand-700 hover:underline">{applicantOf(v)}</Link>
                      <p className="text-xs text-gray-600 font-mono">{v.applicationNumber ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3"><VisaStatusBadge status={v.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{v.applicantPassport || v.pilgrim?.passportNumber || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{v.visaType ?? '—'}{v.externalRef ? <span className="block text-gray-600">No. {v.externalRef}</span> : null}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{shortDate(v.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">Page {page} of {totalPages} · {total} results</p>
            <div className="flex gap-1.5">
              <Button variant="secondary" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>Previous</Button>
              <Button variant="secondary" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {creating && canSubmit && <NewVisaModal canLinkTravelers={can('crm:pilgrim:read')} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewVisaModal({ canLinkTravelers, onClose }: { canLinkTravelers: boolean; onClose: () => void }) {
  const router = useRouter();
  const create = useCreateVisa();
  const [pilgrimId, setPilgrimId] = useState('');
  const [form, setForm] = useState<VisaForm>(emptyVisaForm());
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const errors = visaFormErrors(form, { requireName: !pilgrimId });

  const pick = (id: string, p?: any) => {
    setPilgrimId(id);
    if (p) {
      setForm((f) => ({
        ...f,
        applicantName: [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || f.applicantName,
        applicantPassport: p.passportNumber ?? f.applicantPassport,
        applicantNationality: p.nationality ?? f.applicantNationality,
      }));
    }
  };

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length || create.isPending) return;
    setServerError('');
    try {
      const created = await create.mutateAsync({ ...visaPayload(form, { includeRef: false, forUpdate: false }), pilgrimId: pilgrimId || undefined, currency: 'SAR' });
      toast.success('Visa application created');
      onClose();
      router.push(`/compliance/${created.id}`);
    } catch (e) {
      setServerError(apiErrorMessage(e, 'The application could not be created.'));
    }
  };

  return (
    <ModalSurface busy={create.isPending} title="New visa application" onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(); }} className="bg-white rounded-xl w-full max-w-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <ModalHeader title="New visa application" onClose={onClose} busy={create.isPending} />
        {serverError && <div className="mb-3"><Alert title={serverError} /></div>}
        {canLinkTravelers && <TravelerPicker value={pilgrimId} onPick={pick} />}
        <VisaFormFields form={form} setForm={setForm} errors={touched ? errors : {}} isEdit={false} canManage={false} />
        <ModalFooter onClose={onClose} pending={create.isPending} cta="Create application" />
      </form>
    </ModalSurface>
  );
}

/** Only rendered for accounts that may read traveler records, so nobody else triggers the request. */
function TravelerPicker({ value, onPick }: { value: string; onPick: (id: string, pilgrim?: any) => void }) {
  const pilgrims = usePilgrims({ limit: 100 });
  const list = pilgrims.data?.items ?? [];
  return (
    <div className="mb-3">
      <FormField label="Traveler record (optional)" hint={pilgrims.error ? 'Traveler records could not be loaded; enter the applicant below.' : 'Fills the applicant details from your CRM'}>{(p) => (
        <Select {...p} value={value} onChange={(e) => onPick(e.target.value, list.find((x: any) => x.id === e.target.value))} disabled={!!pilgrims.error}>
          <option value="">{pilgrims.isLoading ? 'Loading travelers…' : 'Not linked — external applicant'}</option>
          {list.map((x: any) => (
            <option key={x.id} value={x.id}>{[x.firstNameEn, x.lastNameEn].filter(Boolean).join(' ') || x.firstNameAr || 'Traveler'}{x.passportNumber ? ` · ${x.passportNumber}` : ''}</option>
          ))}
        </Select>
      )}</FormField>
    </div>
  );
}
