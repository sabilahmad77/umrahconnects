'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input, Select , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import Link from 'next/link';
import {
  Building2, RefreshCw, Loader2, AlertCircle, Search, Archive, Download,
  CheckCircle2, Ban, Clock, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  useAdminTenants, useSetTenantStatus, useArchiveTenant, useAdminExport, useAdminStats } from '@/hooks/use-admin';
import { TENANT_STATUSES, TENANT_STATUS_META } from '@/lib/statuses';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';

const FILTERS = ['ALL', ...TENANT_STATUSES] as const;
const PAGE_SIZE = 20;

/** Uses the shared helper so validation arrays render as a sentence. */
const apiError = (e: any) => apiErrorMessage(e, 'Action failed');

export function AdminTenantsView() {
  const [status, setStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const params = {
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const { data, isLoading, error, refetch } = useAdminTenants(params);
  const setTenantStatus = useSetTenantStatus();
  const archive = useArchiveTenant();
  const exportCsv = useAdminExport();

  const { data: stats } = useAdminStats();
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Platform-wide counts from /admin/stats. These previously counted only the
  // rows on the current page while sitting beside a platform-wide total, which
  // read as platform-wide figures.
  const byStatus: Record<string, number> = stats?.tenants?.byStatus ?? {};
  const tiles = [
    { label: 'Total tenants', value: total,                      color: 'text-gray-700',  Icon: Building2 },
    { label: 'Active',        value: byStatus.ACTIVE ?? 0,       color: 'text-green-800', Icon: CheckCircle2 },
    { label: 'Suspended',     value: byStatus.SUSPENDED ?? 0,    color: 'text-red-700',   Icon: Ban },
    { label: 'Pending KYC',   value: stats?.kyc?.pending ?? 0,   color: 'text-yellow-800', Icon: Clock },
  ];

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast.success(okMsg); refetch(); }
    catch (e: any) { toast.error(apiError(e)); }
  };

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All tenants</h1>
          <p className="text-sm text-gray-600 mt-0.5">{total.toLocaleString()} tenants across the platform</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button"
            onClick={() => run(() => exportCsv.mutateAsync({ kind: 'tenants', params }), 'Tenants exported')}
            disabled={exportCsv.isPending}
            className="inline-flex items-center gap-2 text-sm px-3.5 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 disabled:opacity-50"
          >
            {exportCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </Button>
          <Button variant="quiet" type="button" onClick={() => refetch()} aria-label="Refresh tenants" className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{Number(t.value).toLocaleString()}</p>
            <div className={cn('inline-flex items-center gap-1.5 text-xs font-medium mt-1', t.color)}>
              <t.Icon className="h-3.5 w-3.5" /> {t.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-72 focus-within:border-brand-300">
          <Search className="h-4 w-4 text-gray-600" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            aria-label="Search"
            placeholder="Search tenant name…"
            className="text-sm bg-transparent flex-1 outline-none placeholder:text-gray-600"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((s) => (
            <Button variant="quiet" type="button"
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {s === 'ALL' ? 'All' : TENANT_STATUS_META[s]?.label ?? s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center px-6">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-semibold text-gray-700">No tenants match this view</p>
          <p className="text-xs text-gray-600 mt-1">Clear the search or pick a different status filter.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
              <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3">Tenant</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Country</th>
                  <th className="text-left p-3">Users</th>
                  <th className="text-left p-3">Created</th>
                  <th className="text-left p-3">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((t: any) => {
                  const meta = TENANT_STATUS_META[t.status] ?? { label: t.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/60">
                      <td className="p-3">
                        <Link href={`/admin-tenants/${t.id}`} className="group">
                          <p className="font-medium text-gray-900 group-hover:underline inline-flex items-center gap-1">
                            {t.name} <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                          </p>
                          <p className="text-xs text-gray-600">{t.email ?? '—'} · {t.slug}</p>
                        </Link>
                      </td>
                      <td className="p-3 text-xs text-gray-600">{t.type?.replace(/_/g, ' ')}</td>
                      <td className="p-3 text-xs text-gray-600">{t.country ?? '—'}</td>
                      <td className="p-3">{t._count?.users ?? 0}</td>
                      <td className="p-3 text-xs text-gray-600">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium', meta.color)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />{meta.label}
                          </span>
                          <Select disabled={setTenantStatus.isPending}
                            value={t.status}
                            aria-label={`Status for ${t.name}`}
                            onChange={(e) => { try {
                              const next = e.target.value;
                              const blocking = next !== 'ACTIVE';
                              setConfirm({
                                title: `Set ${t.name} to ${TENANT_STATUS_META[next]?.label ?? next}?`,
                                body: blocking
                                  ? `Everyone in ${t.name} is signed out of the platform until the tenant is set back to Active. Their data is untouched.`
                                  : `${t.name} regains access to the platform immediately.`,
                                cta: 'Change status',
                                tone: blocking ? 'danger' : 'default',
                                onConfirm: () => run(
                                  () => setTenantStatus.mutateAsync({ id: t.id, status: next }),
                                  `${t.name} → ${TENANT_STATUS_META[next]?.label ?? next}`,
                                ),
                              });
                            } catch (error) { toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.')); } }}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          >
                            {TENANT_STATUSES.map((s) => (
                              <option key={s} value={s}>{TENANT_STATUS_META[s].label}</option>
                            ))}
                          </Select>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <Button variant="quiet" type="button"
                          aria-label={`Archive ${t.name}`}
                          disabled={!!t.deletedAt}
                          onClick={() => setConfirm({
                            title: `Archive ${t.name}?`,
                            body: `The tenant is marked Archived and everyone in it loses access. Records are retained, not deleted. This is not undone by a single click.`,
                            cta: 'Archive tenant',
                            tone: 'danger',
                            typeToConfirm: t.slug,
                            onConfirm: () => run(() => archive.mutateAsync(t.id), `${t.name} archived`),
                          })}
                          className="p-1.5 rounded hover:bg-red-50 text-red-700 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <p className="text-xs text-gray-600">Page {page} of {totalPages} · {total} tenants</p>
              <div className="flex gap-1.5">
                <Button variant="quiet" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</Button>
                <Button variant="quiet" type="button" onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
