'use client';
import { apiErrorMessage } from '@/lib/api-error';
import { Input , Button , QueryFailure } from '@/components/ui/system';


import { useState } from 'react';
import { ConfirmDialog, type ConfirmSpec } from '@/components/ui/confirm-dialog';
import { Store, RefreshCw, Loader2, AlertCircle, Search, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAdminListings, useApproveListing, useAdminRemoveListing } from '@/hooks/use-admin';

const STATUSES = ['ALL', 'DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED', 'TAKEN_DOWN'];
const takenDown = (l: any) => l.moderationStatus === 'TAKEN_DOWN';

export function AdminListingsView() {
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useAdminListings({
    status: status !== 'ALL' ? status : undefined,
    search: search || undefined,
  });
  const approve = useApproveListing();
  const remove = useAdminRemoveListing();
  const items = data?.items ?? [];
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      void refetch();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'This action could not be completed. Try again.'));
      throw error;
    }
  };

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All marketplace listings</h1>
          <p className="text-sm text-gray-600 mt-0.5">{data?.total ?? 0} listings across every vendor &amp; tenant</p>
        </div>
        <Button variant="quiet" type="button" aria-label="Refresh information" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-500 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-600" />
          <Input aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search listing…" className="text-sm bg-transparent flex-1 outline-none" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <Button variant="quiet" type="button"
              key={s}
              onClick={() => setStatus(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                status === s ? 'bg-brand-500 text-white border-brand-500 hover:bg-brand-600 hover:text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
            >
              {s.replace(/_/g, ' ')}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <Store className="h-12 w-12 mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-600">No listings found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div role="region" aria-label="Scrollable records" tabIndex={0} className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left p-3">Listing</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Vendor</th>
                <th className="text-left p-3">Price</th>
                <th className="text-left p-3">Status</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((l: any) => (
                <tr key={l.id} className="hover:bg-gray-50/60">
                  <td className="p-3">
                    {/* Listing pages belong to the marketplace workspace, which platform
                        accounts do not have; the moderation facts are shown here instead. */}
                    <p className="font-medium text-gray-900">{l.name}</p>
                    {l.description && <p className="mt-0.5 max-w-md text-xs text-gray-600 line-clamp-2">{l.description}</p>}
                    <p className="text-xs text-gray-600">Created {new Date(l.createdAt).toLocaleDateString()}</p>
                  </td>
                  <td className="p-3 text-xs text-gray-600">{l.type?.replace(/_/g, ' ')}</td>
                  <td className="p-3 text-xs text-gray-600">{l.vendor?.name ?? '—'} <span className="text-xs text-gray-600">{l.vendor?.status}</span></td>
                  <td className="p-3 font-medium">{l.currency} {(l.priceCents / 100).toLocaleString()}</td>
                  <td className="p-3">
                    {takenDown(l) ? (
                      <>
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-red-50 text-red-700">TAKEN DOWN</span>
                        {l.moderationReason && <p className="mt-1 max-w-xs text-xs text-gray-600">{l.moderationReason}</p>}
                      </>
                    ) : (
                      <span className={cn('text-xs font-medium px-2 py-1 rounded-full',
                        l.status === 'PUBLISHED' ? 'bg-green-50 text-green-700' :
                        l.status === 'PAUSED' ? 'bg-yellow-50 text-yellow-700' :
                        l.status === 'ARCHIVED' ? 'bg-gray-100 text-gray-600' :
                        'bg-blue-50 text-blue-700')}>{l.status ?? 'DRAFT'}</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {l.status !== 'PUBLISHED' || takenDown(l) ? (
                        <Button busy={approve.isPending} variant="quiet" type="button"
                          aria-label={`${takenDown(l) ? 'Restore' : 'Approve'} ${l.name}`}
                          onClick={() => setConfirm(takenDown(l) ? {
                            title: `Restore “${l.name}”?`,
                            body: 'The takedown is lifted: the listing is published again and its seller can manage it as before.',
                            cta: 'Restore and publish',
                            onConfirm: () => run(() => approve.mutateAsync(l.id), `“${l.name}” is restored`),
                          } : {
                            title: `Publish “${l.name}”?`,
                            body: 'The listing becomes visible and bookable on the marketplace.',
                            cta: 'Approve and publish',
                            onConfirm: () => run(() => approve.mutateAsync(l.id), `“${l.name}” is published`),
                          })}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700"
                        >
                          <CheckCircle2 className="h-3 w-3" /> {takenDown(l) ? 'Restore' : 'Approve'}
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-green-50 text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      )}
                      <Button busy={remove.isPending} variant="quiet" type="button"
                        aria-label={`Take down ${l.name}`}
                        title="Take this listing down"
                        disabled={takenDown(l)}
                        onClick={() => setConfirm({
                          title: `Take down “${l.name}”?`,
                          body: 'The listing leaves the marketplace and cannot be booked. Its seller sees the reason and cannot publish it again; only a platform restore can. Existing bookings are kept.',
                          cta: 'Take down listing',
                          tone: 'danger',
                          reasonLabel: 'Reason shown to the seller',
                          reasonPlaceholder: 'e.g. Photos show a different property',
                          onConfirm: (reason) => run(() => remove.mutateAsync({ id: l.id, reason: reason ?? '' }), `“${l.name}” was taken down`),
                        })}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700"
                      >
                        <Trash2 className="h-3 w-3" /> Take down
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
