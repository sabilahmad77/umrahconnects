'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, AlertCircle, Users, ShieldCheck, History, Archive,
  Building2, Mail, Globe, Hash,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAdminTenant, useSetTenantStatus, useArchiveTenant, useAdminAuditLogs,
} from '@/hooks/use-admin';
import { TENANT_STATUSES, TENANT_STATUS_META, USER_STATUS_META, humanizeStatus } from '@/lib/statuses';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';

const apiError = (e: any) =>
  e?.response?.data?.error?.message ?? e?.response?.data?.message ?? 'Action failed';

export function AdminTenantDetail({ id }: { id: string }) {
  const { data: t, isLoading, error, refetch } = useAdminTenant(id);
  const { data: logs } = useAdminAuditLogs({ resource: 'tenant', limit: 100 });
  const setStatus = useSetTenantStatus();
  const archive = useArchiveTenant();
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading tenant…
      </div>
    );
  }
  if (error || !t) {
    return (
      <div className="py-24 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
        <p className="text-sm text-red-500 mb-2">This tenant could not be loaded</p>
        <Link href="/admin-tenants" className="text-xs text-brand-500 hover:underline">Back to all tenants</Link>
      </div>
    );
  }

  const meta = TENANT_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  const trail = (logs?.items ?? []).filter((l: any) => l.resourceId === id || l.tenantId === id);

  return (
    <div className="space-y-5 pb-10">
      <Link href="/admin-tenants" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All tenants
      </Link>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', meta.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
                {humanizeStatus(t.type)}
              </span>
              {t.deletedAt && (
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-red-50 text-red-600">Archived</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-2">{t.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> {t.slug}</span>
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {t.email ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {t.country ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> created {new Date(t.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={t.status}
              aria-label="Tenant status"
              onChange={(e) => {
                const next = e.target.value;
                const blocking = next !== 'ACTIVE';
                setConfirm({
                  title: `Set ${t.name} to ${TENANT_STATUS_META[next]?.label ?? next}?`,
                  body: blocking
                    ? `Everyone in ${t.name} is signed out until the tenant is Active again. Their data is untouched.`
                    : `${t.name} regains access to the platform immediately.`,
                  cta: 'Change status',
                  tone: blocking ? 'danger' : 'default',
                  onConfirm: () => run(() => setStatus.mutateAsync({ id, status: next }), 'Status updated'),
                });
              }}
              className="text-sm px-3 py-2 border border-gray-200 rounded-xl bg-white outline-none"
            >
              {TENANT_STATUSES.map((s) => <option key={s} value={s}>{TENANT_STATUS_META[s].label}</option>)}
            </select>
            <button
              disabled={!!t.deletedAt}
              onClick={() => setConfirm({
                title: `Archive ${t.name}?`,
                body: 'The tenant is marked Archived and everyone in it loses access. Records are retained, not deleted.',
                cta: 'Archive tenant',
                tone: 'danger',
                typeToConfirm: t.slug,
                onConfirm: () => run(() => archive.mutateAsync(id), 'Tenant archived'),
              })}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 disabled:opacity-40"
            >
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" /> Users ({t._count?.users ?? (t.users?.length ?? 0)})
            </h2>
            {(t.users ?? []).length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">This tenant has no users yet.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {t.users.map((u: any) => {
                  const um = USER_STATUS_META[u.status] ?? { label: u.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  return (
                    <div key={u.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.firstName} {u.lastName}</p>
                        <p className="text-[11px] text-gray-500">{u.email ?? '—'}</p>
                      </div>
                      <span className={cn('inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full font-medium', um.color)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', um.dot)} />{um.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link href={`/admin-users`} className="text-xs text-brand-500 hover:underline mt-3 inline-block">
              Manage users →
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <History className="h-4 w-4 text-gray-500" /> Audit trail
            </h2>
            {trail.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">
                No administrative actions recorded against this tenant yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {trail.map((l: any) => (
                  <li key={l.id} className="flex gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">
                        {humanizeStatus(l.action)} · {l.resource}
                        {l.afterState?.status ? ` → ${l.afterState.status}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(l.occurredAt).toLocaleString()}{l.actorEmail ? ` · ${l.actorEmail}` : ''}
                        {l.metadata?.reason ? ` · ${l.metadata.reason}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-500" /> KYC
            </h2>
            {(t.kycRecords ?? []).length === 0 ? (
              <p className="text-xs text-gray-500">No KYC record submitted.</p>
            ) : (
              <div className="space-y-2">
                {t.kycRecords.map((k: any) => (
                  <div key={k.id} className="text-xs">
                    <p className="text-gray-700 font-medium">
                      {k.verifiedAt ? 'Approved' : k.rejectionReason ? 'Rejected' : 'Pending review'}
                    </p>
                    <p className="text-gray-500">
                      {k.registrySource ?? '—'} · {new Date(k.createdAt).toLocaleDateString()}
                    </p>
                    {k.rejectionReason && <p className="text-red-600 mt-1">{k.rejectionReason}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3">At a glance</h2>
            <dl className="space-y-1.5 text-xs">
              <Row label="Users" value={String(t._count?.users ?? 0)} />
              <Row label="Roles" value={String(t._count?.roles ?? 0)} />
              <Row label="Tier" value={t.tier ?? '—'} />
              <Row label="Archived" value={t.deletedAt ? new Date(t.deletedAt).toLocaleDateString() : 'No'} />
            </dl>
          </div>
        </div>
      </div>

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
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
