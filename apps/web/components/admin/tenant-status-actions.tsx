'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, Ban, RotateCcw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/system';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { apiErrorMessage } from '@/lib/api-error';
import { TENANT_STATUS_META } from '@/lib/statuses';
import { cn } from '@/lib/utils';
import { COMMUNITY_ORGANIZATION_SLUG } from '@/lib/workspace-access';
import { useArchiveTenant, useSetTenantStatus } from '@/hooks/use-admin';

const VERIFICATION = ['PENDING_KYC', 'KYC_SUBMITTED', 'KYC_APPROVED', 'KYC_REJECTED'];
const label = (status?: string | null) => (status ? TENANT_STATUS_META[status]?.label ?? status : '');

export interface TenantActionTarget {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  deletedAt?: string | null;
  /** An approved KYC submission exists, so the organization may be ACTIVE. */
  verified?: boolean;
  /** The status a suspension or archive returns the organization to. */
  restoreStatus?: string | null;
}

/**
 * What a Super Admin can do to an organization's status. Mirrors the API's
 * rules (PUT /admin/tenants/:id/status): suspend, lift a suspension back to
 * where the organization was, restore an archive, archive. There is no way
 * to make an unverified organization ACTIVE here — that is KYC approval — so
 * pending organizations get a link to their review instead.
 */
export function TenantStatusActions({
  tenant,
  compact = false,
  onChanged,
}: {
  tenant: TenantActionTarget;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const setStatus = useSetTenantStatus();
  const archive = useArchiveTenant();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const busy = setStatus.isPending || archive.isPending;

  const protectedTenant = tenant.type === 'PLATFORM' || tenant.slug === COMMUNITY_ORGANIZATION_SLUG;
  const archived = !!tenant.deletedAt || tenant.status === 'CHURNED';
  const returnTo = tenant.restoreStatus ?? (tenant.verified ? 'ACTIVE' : null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      onChanged?.();
    } catch (e) {
      toast.error(apiErrorMessage(e, 'The organization could not be updated. Try again.'));
      throw e;
    }
  };

  const button = cn(
    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40',
    compact && 'px-2 py-1',
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {VERIFICATION.includes(tenant.status) && !archived && (
        <Link
          href={`/admin-kyc?tenant=${tenant.id}`}
          className={cn(button, 'border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100')}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Review KYC
        </Link>
      )}

      {!archived && tenant.status !== 'SUSPENDED' && !protectedTenant && (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          aria-label={`Suspend ${tenant.name}`}
          onClick={() =>
            setConfirm({
              title: `Suspend ${tenant.name}?`,
              body: `Everyone in ${tenant.name} loses access on their next request until the suspension is lifted. Their data is untouched. Lifting it returns the organization to ${label(tenant.status)}.`,
              cta: 'Suspend organization',
              tone: 'danger',
              reasonLabel: 'Reason (kept in the audit trail)',
              onConfirm: (reason) =>
                run(() => setStatus.mutateAsync({ id: tenant.id, status: 'SUSPENDED', reason }), `${tenant.name} suspended`),
            })
          }
          className={cn(button, 'border-red-200 text-red-700 hover:bg-red-50')}
        >
          <Ban className="h-3.5 w-3.5" /> Suspend
        </Button>
      )}

      {(tenant.status === 'SUSPENDED' || archived) && (
        <Button
          variant="quiet"
          type="button"
          disabled={busy || !returnTo}
          title={returnTo ? undefined : 'The status before this change is unknown. Approve a KYC submission to activate it.'}
          aria-label={`${archived ? 'Restore' : 'Lift suspension of'} ${tenant.name}`}
          onClick={() =>
            returnTo &&
            setConfirm({
              title: archived ? `Restore ${tenant.name}?` : `Lift the suspension of ${tenant.name}?`,
              body:
                returnTo === 'ACTIVE'
                  ? `${tenant.name} becomes Active again and its members regain access immediately.`
                  : `${tenant.name} returns to ${label(returnTo)}: its verification continues where it stood.`,
              cta: archived ? 'Restore organization' : 'Lift suspension',
              onConfirm: () =>
                run(() => setStatus.mutateAsync({ id: tenant.id, status: returnTo }), `${tenant.name} → ${label(returnTo)}`),
            })
          }
          className={cn(button, 'border-brand-200 text-brand-700 hover:bg-brand-50')}
        >
          <RotateCcw className="h-3.5 w-3.5" /> {archived ? 'Restore' : 'Lift suspension'}
        </Button>
      )}

      {!archived && !protectedTenant && (
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          aria-label={`Archive ${tenant.name}`}
          onClick={() =>
            setConfirm({
              title: `Archive ${tenant.name}?`,
              body: 'The organization is archived and everyone in it loses access. Records are retained, not deleted, and it can be restored later.',
              cta: 'Archive organization',
              tone: 'danger',
              typeToConfirm: tenant.slug,
              onConfirm: () => run(() => archive.mutateAsync(tenant.id), `${tenant.name} archived`),
            })
          }
          className={cn(button, 'border-red-200 text-red-700 hover:bg-red-50')}
        >
          <Archive className="h-3.5 w-3.5" /> {compact ? <span className="sr-only">Archive</span> : 'Archive'}
        </Button>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
