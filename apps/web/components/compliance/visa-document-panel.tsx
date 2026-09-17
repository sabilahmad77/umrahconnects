'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input, Select , Button , QueryFailure } from '@/components/ui/system';


import { useRef, useState } from 'react';
import {
  FileText, Upload, CheckCircle2, XCircle, Loader2, Trash2, History,
  Download, CalendarClock, Plus, AlertTriangle, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useVisaDocuments, useAddVisaDocument, useUpdateVisaDocument, useRemoveVisaDocument,
  useUploadVisaDocumentVersion, useVerifyVisaDocument, useRejectVisaDocument,
} from '@/hooks/use-visa';
import {
  VISA_DOCUMENT_STATUS_META, VISA_DOCUMENT_TYPES, humanizeStatus,
} from '@/lib/statuses';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { openVisaDocument } from '@/lib/private-documents';

/** Uses the shared helper so validation arrays render as a sentence. */
const apiError = (e: any) => apiErrorMessage(e, 'Action failed');

/**
 * The document workflow for one visa application: record what is required,
 * attach the file, replace it (keeping history), then verify or reject with
 * an attributable decision.
 */
export function VisaDocumentPanel({ visaId }: { visaId: string }) {
  const { data: docs = [], isLoading, refetch , error: visaDocumentsError} = useVisaDocuments(visaId);
  const add = useAddVisaDocument();
  const update = useUpdateVisaDocument();
  const remove = useRemoveVisaDocument();
  const upload = useUploadVisaDocumentVersion();
  const verify = useVerifyVisaDocument();
  const reject = useRejectVisaDocument();

  const [name, setName] = useState('');
  const [type, setType] = useState<string>('PASSPORT');
  const [expiresAt, setExpiresAt] = useState('');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [openVersions, setOpenVersions] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  const addDoc = async () => {
    if (!name.trim()) { toast.error('Document name is required'); return; }
    await run(async () => {
      await add.mutateAsync({ visaId, name: name.trim(), type, expiresAt: expiresAt || undefined } as any);
      setName(''); setExpiresAt('');
    }, 'Document added to the checklist');
  };

  const onFile = async (docId: string, file?: File | null) => {
    if (!file) return;
    setBusyId(docId);
    try {
      await upload.mutateAsync({ visaId, docId, file });
      toast.success(`Uploaded ${file.name}`);
      refetch();
    } catch (e: any) {
      toast.error(apiError(e));
    } finally {
      setBusyId(null);
    }
  };

  if (visaDocumentsError) return <QueryFailure error={visaDocumentsError} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-4">
      {/* Add to the checklist */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
          <Plus className="h-4 w-4 text-gray-600" /> Add a required document
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Document name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}

              placeholder="Passport bio page"
              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value)}

              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none bg-white"
            >
              {VISA_DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{humanizeStatus(t)}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Expires</span>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}

              className="w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg outline-none"
            />
          </label>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="quiet" type="button"
            onClick={addDoc}
            disabled={add.isPending}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add document
          </Button>
        </div>
      </div>

      {/* Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-600" /> Documents ({docs.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading documents…
          </div>
        ) : docs.length === 0 ? (
          <div className="py-12 text-center px-6">
            <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm font-semibold text-gray-700">No documents on this application yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Add what the applicant must provide, attach each file as it arrives, then verify or reject it.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {docs.map((d: any) => {
              const status = d.effectiveStatus ?? d.status;
              const meta = VISA_DOCUMENT_STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
              const busy = busyId === d.id;
              return (
                <div key={d.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-800">{d.name}</p>
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium', meta.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{humanizeStatus(d.type)}</span>
                        {d.version > 0 && (
                          <span className="text-xs text-gray-600 font-mono">v{d.version}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-600">
                        {d.expiresAt && (
                          <span className={cn('inline-flex items-center gap-1', d.isExpired && 'text-orange-800 font-semibold')}>
                            <CalendarClock className="h-3 w-3" />
                            {d.isExpired ? 'expired ' : 'expires '}{new Date(d.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                        {d.verifiedAt && <span className="text-green-700">verified {new Date(d.verifiedAt).toLocaleDateString()}</span>}
                        {d.sizeBytes ? <span>{Math.max(1, Math.round(d.sizeBytes / 1024))} KB</span> : null}
                      </div>
                      {d.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded-lg px-2 py-1 inline-block">
                          <span className="font-semibold">Rejected:</span> {d.rejectionReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <input
                        ref={(el) => { fileInputs.current[d.id] = el; }}
                        type="file"
                        aria-label={`Upload a file for ${d.name}`}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff"
                        onChange={(e) => onFile(d.id, e.target.files?.[0])}
                      />
                      <Button variant="quiet" type="button"
                        onClick={() => fileInputs.current[d.id]?.click()}
                        aria-label={`${d.url ? 'Replace' : 'Upload'} file for ${d.name}`}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {d.url ? 'Replace' : 'Upload'}
                      </Button>
                      {d.url && (
                        <Button variant="quiet" type="button"
                          onClick={() => openVisaDocument(d.id, undefined, (m) => toast.error(m))}
                          aria-label={`Open ${d.name}`}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5" /> Open
                        </Button>
                      )}
                      <Button variant="quiet" type="button"
                        aria-label={`Verify ${d.name}`}
                        disabled={verify.isPending || !d.url || status === 'VERIFIED' || d.isExpired}
                        onClick={() => run(() => verify.mutateAsync({ visaId, docId: d.id }), `${d.name} verified`)}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                      </Button>
                      <Button variant="quiet" type="button"
                        aria-label={`Reject ${d.name}`}
                        disabled={reject.isPending || status === 'REJECTED'}
                        onClick={() => setConfirm({
                          title: `Reject “${d.name}”?`,
                          body: 'The applicant is told what is wrong and must supply a replacement. The decision is recorded against your account.',
                          cta: 'Reject document',
                          tone: 'danger',
                          reasonLabel: 'Why is this document being rejected?',
                          reasonPlaceholder: 'Glare obscures the MRZ line',
                          onConfirm: (reason) => run(
                            () => reject.mutateAsync({ visaId, docId: d.id, reason: reason ?? '' }),
                            `${d.name} rejected`),
                        })}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button variant="quiet" type="button"
                        onClick={() => setOpenVersions(openVersions === d.id ? null : d.id)}
                        aria-label={`Version history for ${d.name}`}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        <History className="h-3.5 w-3.5" /> {d.versionCount ?? d.version ?? 0}
                      </Button>
                      <Button variant="quiet" type="button"
                        aria-label={`Remove ${d.name}`}
                        onClick={() => setConfirm({
                          title: `Remove “${d.name}”?`,
                          body: 'The document and every stored version are deleted. This cannot be undone.',
                          cta: 'Remove document',
                          tone: 'danger',
                          onConfirm: () => run(() => remove.mutateAsync({ visaId, docId: d.id }), 'Document removed'),
                        })}
                        className="p-1.5 rounded hover:bg-red-50 text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {openVersions === d.id && <VersionHistory visaId={visaId} docId={d.id} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function VersionHistory({ visaId, docId }: { visaId: string; docId: string }) {
  const { data } = useVisaDocumentVersions(visaId, docId);
  const versions = data ?? [];
  return (
    <div className="mt-3 bg-gray-50 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2 inline-flex items-center gap-1.5">
        <History className="h-3 w-3" /> Version history
      </p>
      {versions.length === 0 ? (
        <p className="text-xs text-gray-600">No file has been attached yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {versions.map((v: any) => (
            <li key={v.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-gray-700 font-mono">v{v.version}</span>
              <span className="text-gray-600 flex-1 truncate">
                {new Date(v.uploadedAt).toLocaleString()}
                {v.replacedAt ? ' · superseded' : ' · current'}
                {v.sizeBytes ? ` · ${Math.max(1, Math.round(v.sizeBytes / 1024))} KB` : ''}
              </span>
              <Button variant="quiet" type="button"
                onClick={() => openVisaDocument(docId, v.version, (m) => toast.error(m))}
                aria-label={`Open version ${v.version}`}
                className="text-brand-600 hover:underline"
              >open</Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Local hook kept beside its only consumer.
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
function useVisaDocumentVersions(visaId: string, docId: string) {
  return useQuery({
    queryKey: ['compliance', 'visas', visaId, 'documents', docId, 'versions'],
    queryFn: async () =>
      (await apiClient.get(`/compliance/visas/${visaId}/documents/${docId}/versions`)).data.data as any[],
    enabled: !!visaId && !!docId,
  });
}
