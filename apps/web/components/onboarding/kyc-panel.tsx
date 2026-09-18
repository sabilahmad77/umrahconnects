'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, FileText, RefreshCw, XCircle } from 'lucide-react';
import {
  Alert, Badge, Button, Card, EmptyState, FileUpload, Input, LoadingState, QueryFailure, Select,
} from '@/components/ui/system';
import { DocumentLink } from '@/components/ui/document-link';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { apiClient } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { loadSessionUser } from '@/lib/session';
import { cn } from '@/lib/utils';
import {
  formatBytes, kycFileProblem, KYC_ACCEPT, KYC_MAX_FILES, REGISTRY_SOURCES, submissionState,
} from './organization-rules';

interface KycDocument {
  storageKey: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface KycRecord {
  id: string;
  registrySource: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt?: string;
  documents: KycDocument[];
}

interface QueuedFile {
  id: string;
  file: File;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
  result?: KycDocument;
}

const date = (value?: string | null) => (value ? new Date(value).toLocaleString() : '');

/** The organization's own KYC submissions, newest first. */
export function useKycHistory(enabled: boolean, poll: boolean) {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ['organization', 'kyc', user?.tenantId],
    enabled,
    queryFn: async () => (await apiClient.get('/tenants/me/kyc')).data.data as KycRecord[],
    // The decision is made elsewhere, by a platform reviewer: look again when
    // the person comes back to the tab, and now and then while waiting.
    refetchOnWindowFocus: true,
    refetchInterval: poll ? 30_000 : false,
  });
}

/**
 * Verification for an organization that is not active yet: what is needed,
 * where the review stands, the documents to upload, and the history of
 * submissions with the reviewer's reason when one was sent back.
 */
export function KycPanel() {
  const { user, setUser } = useAuthContext();
  const { can } = useCapabilities();
  const status = user?.tenantStatus ?? 'PENDING_KYC';
  const canRead = can('core:tenant:read');
  const canSubmit = can('core:tenant:update');
  const history = useKycHistory(canRead, status === 'KYC_SUBMITTED');
  const [checking, setChecking] = useState(false);

  const records = history.data ?? [];
  const latest = records[0];
  const rejected = status === 'KYC_REJECTED' ? records.find((r) => r.rejectionReason) : undefined;
  const acceptsDocuments = status === 'PENDING_KYC' || status === 'KYC_REJECTED';

  /** Re-read the organization's status and its submissions (the reviewer may have decided). */
  const checkStatus = async () => {
    setChecking(true);
    try {
      const [next] = await Promise.all([loadSessionUser(), history.refetch()]);
      setUser(next);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The status could not be checked. Try again.'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-gray-600">Organization</p>
            <h2 className="mt-1 break-words text-lg font-semibold">{user?.tenantName}</h2>
          </div>
          <Button variant="secondary" busy={checking} onClick={checkStatus}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Check status
          </Button>
        </div>
        <VerificationSteps status={status} />
        <div className="mt-5">
          <StatusSummary status={status} latest={latest} rejected={rejected} canSubmit={canSubmit} loading={history.isLoading} />
        </div>
      </Card>

      {acceptsDocuments && canSubmit && (
        <KycUploader
          resubmission={status === 'KYC_REJECTED'}
          onSubmitted={async () => {
            await checkStatus();
          }}
        />
      )}

      {canRead && (
        <Card>
          <h2 className="text-lg font-semibold">Verification history</h2>
          <div className="mt-4">
            {history.error ? (
              <QueryFailure error={history.error} onRetry={() => void history.refetch()} />
            ) : history.isLoading ? (
              <LoadingState label="Loading verification history…" />
            ) : records.length === 0 ? (
              <EmptyState title="No submissions yet" description="Your submitted documents and the reviewer’s decisions appear here." />
            ) : (
              <ol className="space-y-4">
                {records.map((record) => (
                  <SubmissionItem key={record.id} record={record} />
                ))}
              </ol>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function VerificationSteps({ status }: { status: string }) {
  const steps = [
    { label: 'Organization created', state: 'done' },
    {
      label: status === 'KYC_REJECTED' ? 'Corrected documents' : 'Documents submitted',
      state: status === 'KYC_SUBMITTED' ? 'done' : 'current',
    },
    {
      label: status === 'KYC_REJECTED' ? 'Changes required' : 'Platform review',
      state: status === 'KYC_SUBMITTED' ? 'current' : status === 'KYC_REJECTED' ? 'attention' : 'todo',
    },
    { label: 'Workspace active', state: 'todo' },
  ] as const;
  return (
    <ol aria-label="Verification progress" className="mt-5 grid gap-3 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm',
            step.state === 'done' && 'border-brand-200 bg-brand-50 text-brand-800',
            step.state === 'current' && 'border-gold-300 bg-gold-50 font-semibold text-gray-900',
            step.state === 'attention' && 'border-amber-200 bg-amber-50 font-semibold text-amber-900',
            step.state === 'todo' && 'border-gray-200 text-gray-600',
          )}
        >
          <span className="block text-xs text-gray-600">Step {index + 1}</span>
          {step.label}
          {step.state === 'done' && <span className="sr-only"> (complete)</span>}
        </li>
      ))}
    </ol>
  );
}

function StatusSummary({
  status,
  latest,
  rejected,
  canSubmit,
  loading,
}: {
  status: string;
  latest?: KycRecord;
  rejected?: KycRecord;
  canSubmit: boolean;
  loading: boolean;
}) {
  if (status === 'KYC_SUBMITTED') {
    return (
      <Alert tone="info" title="Awaiting review">
        Your documents were submitted{latest ? ` on ${date(latest.createdAt)}` : ''}. Umrah Connect reviews them and the
        decision appears on this page. There is nothing else to do for now.
      </Alert>
    );
  }
  if (status === 'KYC_REJECTED') {
    return (
      <Alert title="Changes required">
        <p>The reviewer sent the submission back{rejected?.updatedAt ? ` on ${date(rejected.updatedAt)}` : ''}:</p>
        <p className="mt-2 whitespace-pre-line font-medium">{rejected?.rejectionReason ?? (loading ? 'Loading the reviewer’s note…' : 'No reason was recorded.')}</p>
        <p className="mt-2">
          {canSubmit ? 'Upload corrected documents below and submit again.' : 'Your organization administrator can submit corrected documents.'}
        </p>
      </Alert>
    );
  }
  if (status === 'KYC_APPROVED') {
    return (
      <Alert tone="info" title="Approved">
        The verification was approved. Use “Check status” to open the workspace.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Documents needed">
      <p>Upload documents that show the organization is registered and licensed, for example:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>its commercial registration or trade licence;</li>
        <li>its licence from the Hajj and Umrah authority it works with, if it has one;</li>
        <li>proof of the organization’s address.</li>
      </ul>
      {!canSubmit && <p className="mt-2">Your organization administrator submits the documents.</p>}
    </Alert>
  );
}

function SubmissionItem({ record }: { record: KycRecord }) {
  const state = submissionState(record);
  const source = REGISTRY_SOURCES.find((s) => s.value === record.registrySource)?.label ?? record.registrySource;
  return (
    <li className="rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Submitted {date(record.createdAt)}</p>
        {state === 'approved' ? (
          <Badge tone="success">Verified</Badge>
        ) : state === 'rejected' ? (
          <Badge tone="danger">Changes required</Badge>
        ) : (
          <Badge tone="warning">Awaiting review</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-600">Licensing authority: {source}</p>
      {state === 'approved' && <p className="mt-2 text-sm text-gray-700">Approved {date(record.verifiedAt)}.</p>}
      {state === 'rejected' && (
        <p className="mt-2 whitespace-pre-line text-sm text-red-800">
          <span className="font-semibold">Reason{record.updatedAt ? ` (${date(record.updatedAt)})` : ''}:</span> {record.rejectionReason}
        </p>
      )}
      {record.documents?.length > 0 && (
        <ul className="mt-3 space-y-2">
          {record.documents.map((doc, index) => (
            <li key={`${record.id}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
              <FileText aria-hidden="true" className="h-4 w-4 text-gray-600" />
              <span className="min-w-0 break-all">{doc.name ?? `Document ${index + 1}`}</span>
              {doc.sizeBytes ? <span className="text-xs text-gray-600">{formatBytes(doc.sizeBytes)}</span> : null}
              <DocumentLink documentId={record.id} kycIndex={index} name={doc.name ?? `document ${index + 1}`} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Pick, upload and submit verification documents. Each file uploads on its
 * own with progress; a failed one can be retried and any one removed before
 * the submission is sent. Submitting is refused while anything is uploading,
 * and a second click while the first is in flight does nothing.
 */
function KycUploader({ resubmission, onSubmitted }: { resubmission: boolean; onSubmitted: () => Promise<void> }) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [registrySource, setRegistrySource] = useState<string>('MANUAL');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [pickError, setPickError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const sequence = useRef(0);

  // Pre-fill the licence number the organization gave when it was created.
  const { user } = useAuthContext();
  const profile = useQuery({
    queryKey: ['organization', 'profile', user?.tenantId],
    queryFn: async () => (await apiClient.get('/tenants/me')).data.data as { licenseNumber?: string | null },
  });
  useEffect(() => {
    if (profile.data?.licenseNumber) setLicenseNumber((current) => current || profile.data?.licenseNumber || '');
  }, [profile.data?.licenseNumber]);

  const update = (id: string, patch: Partial<QueuedFile>) =>
    setQueue((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const upload = async (item: QueuedFile) => {
    update(item.id, { status: 'uploading', progress: 0, error: undefined });
    const body = new FormData();
    body.append('file', item.file);
    try {
      const { data } = await apiClient.post('/documents/kyc', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total) update(item.id, { progress: Math.min(99, Math.round((event.loaded / event.total) * 100)) });
        },
      });
      update(item.id, { status: 'done', progress: 100, result: data.data });
    } catch (e: any) {
      const message =
        e?.response?.status === 413
          ? 'This file is larger than 15 MB.'
          : apiErrorMessage(e, 'The upload failed. Check your connection and try again.');
      update(item.id, { status: 'error', error: message });
    }
  };

  const pick = (files: FileList | null) => {
    setPickError('');
    setError('');
    const chosen = Array.from(files ?? []);
    const room = KYC_MAX_FILES - queue.length;
    if (chosen.length > room) setPickError(`Attach at most ${KYC_MAX_FILES} documents.`);
    const refused: string[] = [];
    const accepted: QueuedFile[] = [];
    for (const file of chosen.slice(0, Math.max(0, room))) {
      const problem = kycFileProblem(file);
      if (problem) refused.push(`${file.name}: ${problem}`);
      else accepted.push({ id: `kyc-${++sequence.current}`, file, status: 'uploading', progress: 0 });
    }
    if (refused.length) setPickError(refused.join(' '));
    if (accepted.length) {
      setQueue((items) => [...items, ...accepted]);
      accepted.forEach((item) => void upload(item));
    }
  };

  const uploaded = queue.filter((item) => item.status === 'done' && item.result);
  const uploading = queue.some((item) => item.status === 'uploading');

  const submit = async () => {
    if (submitting.current) return;
    setError('');
    if (uploading) {
      setError('Wait for the uploads to finish.');
      return;
    }
    if (!uploaded.length) {
      setError('Upload at least one document.');
      return;
    }
    if (licenseNumber.trim().length > 100) {
      setError('The licence number can have at most 100 characters.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await apiClient.post('/tenants/me/kyc', {
        registrySource,
        licenseNumber: licenseNumber.trim() || undefined,
        documents: uploaded.map((item) => item.result),
      });
      setQueue([]);
      toast.success('Your documents were submitted for review.');
      await onSubmitted();
    } catch (e) {
      setError(apiErrorMessage(e, 'The documents could not be submitted. Try again.'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-semibold">{resubmission ? 'Submit corrected documents' : 'Submit verification documents'}</h2>
      <p className="mt-2 text-sm text-gray-600">
        PDF, JPEG, PNG, WebP, HEIC or TIFF, up to 15 MB each. Files are stored privately and only your organization and
        Umrah Connect reviewers can open them.
      </p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-medium">
          <span>Licensing authority</span>
          <Select value={registrySource} onChange={(e) => setRegistrySource(e.target.value)}>
            {REGISTRY_SOURCES.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Licence or registration number (optional)</span>
          <Input maxLength={100} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
        </label>
      </div>
      <div className="mt-5">
        <FileUpload
          label="Add documents"
          multiple
          accept={KYC_ACCEPT}
          disabled={busy || queue.length >= KYC_MAX_FILES}
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
        {pickError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {pickError}
          </p>
        )}
      </div>
      {queue.length > 0 && (
        <ul aria-label="Documents to submit" className="mt-5 space-y-3">
          {queue.map((item) => (
            <li key={item.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {item.status === 'done' ? (
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : item.status === 'error' ? (
                    <XCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-red-700" />
                  ) : (
                    <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-600" />
                  )}
                  <span className="min-w-0 break-all text-sm font-medium">{item.file.name}</span>
                  <span className="text-xs text-gray-600">{formatBytes(item.file.size)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {item.status === 'error' && (
                    <Button variant="quiet" onClick={() => void upload(item)} aria-label={`Retry ${item.file.name}`}>
                      Retry
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    disabled={item.status === 'uploading' || busy}
                    onClick={() => setQueue((items) => items.filter((other) => other.id !== item.id))}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {item.status === 'uploading' && (
                <div
                  role="progressbar"
                  aria-label={`Uploading ${item.file.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progress}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100"
                >
                  <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${item.progress}%` }} />
                </div>
              )}
              {item.status === 'uploading' && <p className="mt-1 text-xs text-gray-600">Uploading… {item.progress}%</p>}
              {item.status === 'done' && <p className="mt-1 text-xs text-brand-700">Uploaded</p>}
              {item.status === 'error' && (
                <p role="alert" className="mt-1 text-xs text-red-700">
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <div className="mt-5">
          <Alert title="Not submitted">{error}</Alert>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button busy={busy} disabled={uploading || !uploaded.length} onClick={submit}>
          {resubmission ? 'Submit corrected documents' : 'Submit for review'}
        </Button>
        <p className="text-sm text-gray-600" aria-live="polite">
          {uploading
            ? 'Uploading…'
            : uploaded.length
              ? `${uploaded.length} document${uploaded.length === 1 ? '' : 's'} ready`
              : 'No documents added yet'}
        </p>
      </div>
    </Card>
  );
}
