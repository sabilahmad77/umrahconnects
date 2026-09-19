'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, CheckCircle2, FileText, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, LoadingState, QueryFailure } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { openKycDocument } from '@/lib/private-documents';
import { apiErrorMessage } from '@/lib/api-error';
import { TENANT_STATUS_META, humanizeStatus } from '@/lib/statuses';
import { cn } from '@/lib/utils';
import { useAdminKyc, useApproveKyc, useRejectKyc, type KycDecision } from '@/hooks/use-admin';

const FILTERS = [
  { value: 'PENDING', label: 'Awaiting review' },
  { value: 'REJECTED', label: 'Sent back' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ALL', label: 'All' },
] as const;

const REGISTRY_LABELS: Record<string, string> = {
  NUSUK_MASAR: 'Nusuk / Masar (Saudi Arabia)',
  SISKOPATUH: 'SISKOPATUH (Indonesia)',
  NAHCON: 'NAHCON (Nigeria)',
  DIYANET: 'Diyanet (Türkiye)',
  TABUNG_HAJI: 'Tabung Haji (Malaysia)',
  MOTAC: 'MOTAC (Malaysia)',
  IBA_DGRP: 'IBA / DGRP',
  MANUAL: 'Other — manual review',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const when = (value?: string | null) => (value ? new Date(value).toLocaleString() : '');

/**
 * Super Admin review of organization verification. Approving is the only way
 * an organization being verified becomes ACTIVE; rejecting sends it back with
 * a reason the organization sees. Each submission is decided once, and every
 * decision is attributed in the audit trail shown on the card.
 */
export function AdminKycView({ tenantId }: { tenantId?: string }) {
  const organization = tenantId && UUID.test(tenantId) ? tenantId : undefined;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>(organization ? 'ALL' : 'PENDING');
  const { data: items = [], isLoading, isFetching, error, refetch } = useAdminKyc({
    status: filter === 'ALL' ? undefined : filter,
    tenantId: organization,
  });
  const approve = useApproveKyc();
  const reject = useRejectKyc();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const decide = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The decision could not be recorded. Try again.'));
      // Keep the dialog open so the reviewer can correct the reason or retry.
      throw e;
    }
  };

  if (error) return <QueryFailure error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYC verification</h1>
          <p className="mt-0.5 text-sm text-gray-600">
            {isLoading ? 'Loading submissions…' : `${items.length} submission${items.length === 1 ? '' : 's'}`}
            {organization ? ' for one organization' : ''}
          </p>
        </div>
        <Button
          variant="quiet"
          type="button"
          aria-label="Refresh submissions"
          onClick={() => void refetch()}
          className="rounded-xl border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter submissions">
        {FILTERS.map((f) => (
          <Button
            variant="quiet"
            type="button"
            key={f.value}
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
              filter === f.value ? 'border-brand-500 bg-brand-500 text-white hover:bg-brand-600 hover:text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300',
            )}
          >
            {f.label}
          </Button>
        ))}
        {organization && (
          <Link href="/admin-kyc" className="ml-2 text-xs font-medium text-brand-700 hover:underline">
            Show every organization
          </Link>
        )}
      </div>

      {isLoading ? (
        <LoadingState label="Loading submissions…" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <ShieldCheck className="mx-auto mb-3 h-12 w-12 text-gray-200" />
          <p className="text-sm text-gray-600">No submissions in this view.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((k: any) => {
            const state = k.verifiedAt ? 'APPROVED' : k.rejectionReason ? 'REJECTED' : 'PENDING';
            const tenant = k.tenant ?? {};
            const tenantMeta = TENANT_STATUS_META[tenant.status] ?? { label: humanizeStatus(tenant.status), color: 'bg-gray-100 text-gray-600' };
            const decisions: KycDecision[] = k.decisions ?? [];
            const name = tenant.name ?? 'this organization';
            return (
              <li key={k.id} className="rounded-xl border border-gray-200 bg-white p-5" data-kyc-id={k.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-50 text-yellow-700">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{tenant.name ?? '—'}</p>
                      <p className="text-xs text-gray-600">
                        {humanizeStatus(tenant.type)} · {tenant.country ?? '—'} · {tenant.email ?? '—'}
                        {tenant.phone ? ` · ${tenant.phone}` : ''}
                      </p>
                      <p className="text-xs text-gray-600">
                        Licensing authority: {REGISTRY_LABELS[k.registrySource] ?? k.registrySource}
                        {tenant.licenseNumber ? ` · Licence ${tenant.licenseNumber}` : ''}
                        {tenant.website ? ` · ${tenant.website}` : ''}
                      </p>
                      <p className="text-xs text-gray-600">Submitted {when(k.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium',
                        state === 'APPROVED' ? 'bg-green-50 text-green-700' : state === 'REJECTED' ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700',
                      )}
                    >
                      {state === 'APPROVED' ? 'Approved' : state === 'REJECTED' ? 'Sent back' : 'Awaiting review'}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tenantMeta.color)}>
                      Organization: {tenantMeta.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 border-t border-gray-50 pt-3">
                  <p className="mb-1.5 text-xs font-semibold text-gray-600">Documents ({k.documents?.length ?? 0})</p>
                  {Array.isArray(k.documents) && k.documents.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {/* Private files: the server mints a short-lived signed URL after checking the reviewer may see them. */}
                      {k.documents.map((d: any, i: number) => (
                        <Button
                          key={i}
                          variant="quiet"
                          type="button"
                          onClick={() => openKycDocument(k.id, i, (m) => toast.error(m))}
                          aria-label={`Open ${d.name ?? `document ${i + 1}`} of ${name}`}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200"
                        >
                          <FileText className="h-3 w-3" />
                          {d.name ?? `Document ${i + 1}`}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">No documents were attached.</p>
                  )}
                </div>

                {(decisions.length > 0 || k.rejectionReason) && (
                  <div className="mt-3 border-t border-gray-50 pt-3">
                    <p className="mb-1.5 text-xs font-semibold text-gray-600">Decision</p>
                    {decisions.length > 0 ? (
                      <ul className="space-y-1.5">
                        {decisions.map((d, i) => (
                          <li key={i} className="text-xs text-gray-700">
                            <span className="font-semibold">{d.decision === 'APPROVED' ? 'Approved' : 'Sent back'}</span>
                            {d.by ? ` by ${d.by}` : ''} on {when(d.at)}
                            {d.reason && <span className="block whitespace-pre-line text-red-700">Reason: {d.reason}</span>}
                            {d.notes && <span className="block whitespace-pre-line text-gray-600">Note: {d.notes}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="whitespace-pre-line text-xs text-red-700">Reason: {k.rejectionReason}</p>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-50 pt-3">
                  <Link href={`/admin-tenants/${tenant.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                    Organization details
                  </Link>
                  {state === 'PENDING' && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="quiet"
                        type="button"
                        disabled={reject.isPending || approve.isPending}
                        onClick={() =>
                          setConfirm({
                            title: `Send ${name} back?`,
                            body: 'The organization stays unverified and sees your reason, so it can correct its documents and submit again.',
                            cta: 'Send back',
                            tone: 'danger',
                            reasonLabel: 'Reason the organization will see',
                            reasonPlaceholder: 'For example: the commercial registration scan is unreadable.',
                            onConfirm: (reason) =>
                              decide(() => reject.mutateAsync({ id: k.id, reason: reason ?? '' }), `${name} was sent back`),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100"
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                      <Button
                        variant="quiet"
                        type="button"
                        disabled={reject.isPending || approve.isPending}
                        onClick={() =>
                          setConfirm({
                            title: `Approve ${name}?`,
                            body:
                              tenant.status === 'SUSPENDED' || tenant.deletedAt
                                ? 'The verification is recorded as approved. The organization stays suspended or archived until that is lifted.'
                                : 'The organization becomes active and its members get their workspace immediately. To withdraw it later, suspend the organization.',
                            cta: 'Approve',
                            onConfirm: () => decide(() => approve.mutateAsync({ id: k.id }), `${name} was approved`),
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Approve
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
