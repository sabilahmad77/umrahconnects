'use client';

import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle, Users, ShieldCheck, History, Building2, Mail, Globe, Hash } from 'lucide-react';
import { QueryFailure } from '@/components/ui/system';
import { cn } from '@/lib/utils';
import { useAdminTenant, useAdminAuditLogs } from '@/hooks/use-admin';
import { TENANT_STATUS_META, USER_STATUS_META, humanizeStatus } from '@/lib/statuses';
import { TenantStatusActions } from './tenant-status-actions';

export function AdminTenantDetail({ id }: { id: string }) {
  const { data: t, isLoading, error, refetch } = useAdminTenant(id);
  const { data: logs , error: adminAuditLogsError, refetch: retryAdminAuditLogs} = useAdminAuditLogs({ tenantId: id, limit: 100 });

  if (error || adminAuditLogsError) return <QueryFailure error={error || adminAuditLogsError} onRetry={() => { refetch(); retryAdminAuditLogs(); }} />;
  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-gray-600">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading tenant…
      </div>
    );
  }
  if (error || !t) {
    return (
      <div className="py-24 text-center">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-700 opacity-60" />
        <p className="text-sm text-red-700 mb-2">This tenant could not be loaded</p>
        <Link href="/admin-tenants" className="text-xs text-brand-500 hover:underline">Back to all tenants</Link>
      </div>
    );
  }

  const meta = TENANT_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
  // Scoped by the server to this organization: status changes, KYC submissions and
  // decisions, and account changes made inside it.
  const trail = logs?.items ?? [];


  return (
    <div className="space-y-5 pb-10">
      <Link href="/admin-tenants" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> All tenants
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
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
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-red-50 text-red-700">Archived</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 mt-2">{t.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> {t.slug}</span>
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {t.email ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {t.country ?? '—'}</span>
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> created {new Date(t.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <TenantStatusActions tenant={t} onChanged={() => void refetch()} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-600" /> Users ({t._count?.users ?? (t.users?.length ?? 0)})
            </h2>
            {(t.users ?? []).length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">This tenant has no users yet.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {t.users.map((u: any) => {
                  const um = USER_STATUS_META[u.status] ?? { label: u.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  return (
                    <div key={u.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-gray-600">{u.email ?? '—'}</p>
                      </div>
                      <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium', um.color)}>
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

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <History className="h-4 w-4 text-gray-600" /> Audit trail
            </h2>
            {trail.length === 0 ? (
              <p className="text-xs text-gray-600 py-4 text-center">
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
                      <p className="text-xs text-gray-600">
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
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-600" /> KYC
            </h2>
            {(t.kycRecords ?? []).length === 0 ? (
              <p className="text-xs text-gray-600">No KYC submission yet.</p>
            ) : (
              <ul className="space-y-2">
                {t.kycRecords.map((k: any) => (
                  <li key={k.id} className="text-xs">
                    <p className="font-medium text-gray-700">
                      {k.verifiedAt ? 'Approved' : k.rejectionReason ? 'Sent back' : 'Awaiting review'}
                    </p>
                    <p className="text-gray-600">
                      {k.registrySource ?? '—'} · submitted {new Date(k.createdAt).toLocaleDateString()}
                      {k.verifiedAt ? ` · approved ${new Date(k.verifiedAt).toLocaleDateString()}` : ''}
                    </p>
                    {k.rejectionReason && <p className="mt-1 whitespace-pre-line text-red-600">{k.rejectionReason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/admin-kyc?tenant=${t.id}`} className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline">
              Open in KYC review →
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
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

    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-gray-700 text-right">{value}</dd>
    </div>
  );
}
