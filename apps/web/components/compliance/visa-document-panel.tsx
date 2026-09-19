'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, CheckCircle2, XCircle, Trash2, History, Download, CalendarClock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Button, Input, LoadingState, QueryFailure, Select } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { useCapabilities } from '@/hooks/use-capabilities';
import {
  useAddVisaDocument, useRejectVisaDocument, useRemoveVisaDocument, useUploadVisaDocumentVersion, useVerifyVisaDocument,
  useVisaDocumentVersions, useVisaDocuments,
} from '@/hooks/use-visa';
import { VISA_DOCUMENT_STATUS_META, VISA_DOCUMENT_TYPES, humanizeStatus } from '@/lib/statuses';
import { openVisaDocument } from '@/lib/private-documents';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { dateTime } from '@/components/dashboard/workflow-ui';
import { FormField } from '@/components/hotels/hotel-form';
import { cn } from '@/lib/utils';

/** What the server accepts (it re-checks the type from the file's bytes). */
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff';
const ACCEPTED_EXT = /\.(pdf|jpe?g|png|webp|heic|tiff?)$/i;

/**
 * The document workflow for one visa application: record what is required,
 * attach the file (every replacement is a new version), then verify or reject
 * it with an attributable decision. Files open through short-lived signed links.
 */
export function VisaDocumentPanel({ visaId, locked = false }: { visaId: string; locked?: boolean }) {
  const { ready, can } = useCapabilities();
  const canSubmit = can('visa:application:submit') && !locked;
  const canDecide = can('visa:application:manage') && !locked;
  const { data: docs = [], isLoading, refetch, error } = useVisaDocuments(visaId);
  const add = useAddVisaDocument();
  const remove = useRemoveVisaDocument();
  const upload = useUploadVisaDocumentVersion();
  const verify = useVerifyVisaDocument();
  const reject = useRejectVisaDocument();

  const [name, setName] = useState('');
  const [type, setType] = useState<string>('PASSPORT');
  const [expiresAt, setExpiresAt] = useState('');
  const [nameError, setNameError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const run = async (id: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    try { await fn(); toast.success(okMsg); }
    catch (e) { toast.error(apiErrorMessage(e, 'That document action failed.')); }
    finally { setBusyId(null); }
  };

  const addDoc = async () => {
    if (!name.trim()) { setNameError('Enter the document name.'); return; }
    setNameError('');
    try {
      await add.mutateAsync({ visaId, name: name.trim(), type, expiresAt: expiresAt || undefined });
      toast.success('Document added to the checklist');
      setName(''); setExpiresAt('');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The document could not be added.'));
    }
  };

  const onFile = async (doc: any, file?: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { toast.error(`${file.name} is larger than 15 MB.`); return; }
    if (!ACCEPTED_EXT.test(file.name)) { toast.error('Upload a PDF or an image (JPEG, PNG, WebP, HEIC, TIFF).'); return; }
    await run(doc.id, () => upload.mutateAsync({ visaId, docId: doc.id, file }), `Uploaded ${file.name} as version ${doc.version + 1}`);
    const input = fileInputs.current[doc.id];
    if (input) input.value = '';
  };

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-4">
      {locked ? <ReadOnlyNotice>This application is cancelled: its documents are kept as they were.</ReadOnlyNotice>
        : ready && !canSubmit ? <ReadOnlyNotice>You can open documents. Adding or replacing them needs the visa submission permission.</ReadOnlyNotice> : null}

      {canSubmit && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); addDoc(); }} className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Plus className="h-4 w-4 text-gray-600" /> Add a required document</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2"><FormField label="Document name *" error={nameError}>{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Passport bio page" />}</FormField></div>
            <FormField label="Type">{(p) => <Select {...p} value={type} onChange={(e) => setType(e.target.value)}>{VISA_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{humanizeStatus(t)}</option>)}</Select>}</FormField>
            <FormField label="Expires">{(p) => <Input {...p} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</FormField>
          </div>
          <div className="flex justify-end mt-3"><Button type="submit" busy={add.isPending}><Plus className="h-4 w-4" /> Add document</Button></div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3 border-b border-gray-200"><h2 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><FileText className="h-4 w-4 text-gray-600" /> Documents ({docs.length})</h2></div>
        {isLoading ? <LoadingState label="Loading documents…" /> : docs.length === 0 ? (
          <div className="py-12 text-center px-6">
            <FileText className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-semibold text-gray-700">No documents on this application yet</p>
            {canSubmit && <p className="text-xs text-gray-600 mt-1">Add what the applicant must provide, attach each file as it arrives, then have it verified.</p>}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d: any) => {
              const status = d.effectiveStatus ?? d.status;
              const meta = VISA_DOCUMENT_STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
              const busy = busyId === d.id;
              const removable = canSubmit && (d.status !== 'VERIFIED' || canDecide);
              return (
                <li key={d.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium', meta.color)}><span aria-hidden="true" className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{humanizeStatus(d.type)}</span>
                        {d.version > 0 && <span className="text-xs text-gray-600 font-mono">v{d.version}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                        {d.expiresAt && <span className={cn('inline-flex items-center gap-1', d.isExpired && 'text-orange-800 font-semibold')}><CalendarClock className="h-3 w-3" />{d.isExpired ? 'expired ' : 'expires '}{new Date(d.expiresAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</span>}
                        {d.verifiedAt && <span className="text-green-800">verified {dateTime(d.verifiedAt)}</span>}
                        {d.sizeBytes ? <span>{Math.max(1, Math.round(d.sizeBytes / 1024))} KB</span> : null}
                      </div>
                      {d.rejectionReason && <p className="text-xs text-red-700 mt-1.5 bg-red-50 rounded-lg px-2 py-1 inline-block"><span className="font-semibold">Rejected:</span> {d.rejectionReason}</p>}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canSubmit && (
                        <>
                          <input ref={(el) => { fileInputs.current[d.id] = el; }} type="file" className="hidden" accept={ACCEPT} aria-label={`File for ${d.name}`} onChange={(e) => onFile(d, e.target.files?.[0])} />
                          <Button variant="secondary" type="button" busy={busy && upload.isPending} disabled={busy} onClick={() => fileInputs.current[d.id]?.click()} className="text-xs px-2.5 py-1.5 min-h-0" aria-label={`${d.url ? 'Replace' : 'Upload'} file for ${d.name}`}>
                            <Upload className="h-3.5 w-3.5" /> {d.url ? 'Replace' : 'Upload'}
                          </Button>
                        </>
                      )}
                      {d.url && (
                        <Button variant="secondary" type="button" className="text-xs px-2.5 py-1.5 min-h-0" aria-label={`Open ${d.name}`} onClick={() => openVisaDocument(d.id, undefined, (m) => toast.error(m))}>
                          <Download className="h-3.5 w-3.5" /> Open
                        </Button>
                      )}
                      {canDecide && d.url && status !== 'VERIFIED' && !d.isExpired && (
                        <Button variant="secondary" type="button" busy={busy && verify.isPending} disabled={busy} className="text-xs px-2.5 py-1.5 min-h-0 text-green-800" aria-label={`Verify ${d.name}`}
                          onClick={() => run(d.id, () => verify.mutateAsync({ visaId, docId: d.id }), `${d.name} verified`)}>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                        </Button>
                      )}
                      {canDecide && status !== 'REJECTED' && (
                        <Button variant="secondary" type="button" disabled={busy} className="text-xs px-2.5 py-1.5 min-h-0 text-red-700" aria-label={`Reject ${d.name}`}
                          onClick={() => setConfirm({
                            title: `Reject “${d.name}”?`,
                            body: 'The applicant is told what is wrong and must supply a replacement. The decision is recorded against your account.',
                            cta: 'Reject document', tone: 'danger', reasonLabel: 'Why is this document being rejected?', reasonPlaceholder: 'Glare hides the MRZ line',
                            onConfirm: (reason) => run(d.id, () => reject.mutateAsync({ visaId, docId: d.id, reason: reason ?? '' }), `${d.name} rejected`),
                          })}>
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      )}
                      <Button variant="quiet" type="button" className="text-xs px-2.5 py-1.5 min-h-0" aria-expanded={openVersions === d.id} aria-label={`Version history for ${d.name}`}
                        onClick={() => setOpenVersions(openVersions === d.id ? null : d.id)}>
                        <History className="h-3.5 w-3.5" /> {d.versionCount ?? d.version ?? 0}
                      </Button>
                      {removable && (
                        <Button variant="quiet" type="button" disabled={busy} aria-label={`Remove ${d.name}`} className="p-1.5 min-h-0 rounded hover:bg-red-50 text-red-700"
                          onClick={() => setConfirm({
                            title: `Remove “${d.name}”?`, body: 'The document and every stored version are deleted. This cannot be undone.', cta: 'Remove document', tone: 'danger',
                            onConfirm: () => run(d.id, () => remove.mutateAsync({ visaId, docId: d.id }), 'Document removed'),
                          })}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {openVersions === d.id && <VersionHistory visaId={visaId} docId={d.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function VersionHistory({ visaId, docId }: { visaId: string; docId: string }) {
  const { data, isLoading, error, refetch } = useVisaDocumentVersions(visaId, docId);
  const versions = data ?? [];
  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1.5"><History className="h-3 w-3" /> Version history</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : isLoading ? <p className="text-xs text-gray-600">Loading versions…</p> : versions.length === 0 ? (
        <p className="text-xs text-gray-600">No file has been attached yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {versions.map((v: any) => (
            <li key={v.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-700 font-mono">v{v.version}</span>
              <span className="text-gray-600 flex-1 truncate">{dateTime(v.uploadedAt)}{v.replacedAt ? ' · superseded' : ' · current'}{v.sizeBytes ? ` · ${Math.max(1, Math.round(v.sizeBytes / 1024))} KB` : ''}</span>
              <Button variant="quiet" type="button" className="text-brand-700 hover:underline min-h-0 px-1" aria-label={`Open version ${v.version}`} onClick={() => openVisaDocument(docId, v.version, (m) => toast.error(m))}>open</Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
