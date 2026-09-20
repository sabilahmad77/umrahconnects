'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, BookOpen, Search, Download } from 'lucide-react';
import { Button, Input, LoadingState, QueryFailure } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { ASSIGNMENT_STATUSES, useAssignments } from '@/hooks/use-transport';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { downloadCsv } from '@/components/dashboard/csv';
import { dateTime, humanize, sar } from '@/components/dashboard/workflow-ui';
import { cn } from '@/lib/utils';
import { TripActions, TripModal, TripStatusBadge } from './trip-shared';

/**
 * Transport bookings — the customer-facing view of the same trips as
 * Assignments: who booked, what they pay, and whether it is paid (read-only;
 * payment state follows the payments recorded in Finance).
 */
export function TransportBookingsView() {
  const { ready, can } = useCapabilities();
  const canManage = can('transport:assignment:manage');
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const { data, isLoading, error, refetch } = useAssignments({
    status: status !== 'ALL' ? status : undefined,
    search: search.trim() || undefined,
    limit: 100,
  });
  const items = data?.items ?? [];

  const exportCsv = () => downloadCsv(`transport-bookings-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Customer', 'Type', 'Phone', 'Route', 'Vehicle', 'Driver', 'Pickup', 'Passengers', 'Price', 'Status'],
    ...items.map((a: any) => [
      a.customerName ?? '', a.customerType ?? '', a.customerPhone ?? '', a.route?.name ?? '', a.vehicle?.plateNumber ?? '',
      a.driver ? `${a.driver.firstName} ${a.driver.lastName}` : '', a.scheduledAt ?? '', a.passengerCount,
      (a.priceCents / 100).toFixed(2), a.status,
    ]),
  ]);

  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport bookings</h1>
          <p className="text-sm text-gray-600 mt-0.5">{(data?.total ?? 0).toLocaleString()} bookings — customers, prices and trip status</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh bookings" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Button variant="secondary" type="button" onClick={exportCsv} disabled={items.length === 0}><Download className="h-4 w-4" /> Export</Button>
          {canManage && <Button type="button" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New booking</Button>}
        </div>
      </div>
      {ready && !canManage && <ReadOnlyNotice>You can view bookings. Recording and moving bookings needs the transport assignment permission.</ReadOnlyNotice>}
      <p className="text-xs text-gray-600">Trips do not track payments: bill customers with an invoice in Finance, where the money is recorded.</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white border border-gray-500 rounded-xl px-3 py-2.5 w-full sm:w-72">
          <Search className="h-4 w-4 text-gray-600" />
          <Input aria-label="Search bookings" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Customer or phone…" className="text-sm bg-transparent flex-1 outline-none border-0 p-0 min-h-0" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['ALL', ...ASSIGNMENT_STATUSES].map((s) => (
            <Button variant="quiet" type="button" key={s} aria-pressed={status === s} onClick={() => setStatus(s)}
              className={cn('text-xs px-3 py-1.5 rounded-full border font-medium', status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
              {s === 'ALL' ? 'All' : humanize(s)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? <LoadingState label="Loading bookings…" /> : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No transport bookings in this view</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div role="region" aria-label="Transport bookings" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-600 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3">Customer</th><th className="text-left p-3">Route / vehicle</th><th className="text-left p-3">Pickup</th>
                  <th className="text-left p-3">Pax</th><th className="text-left p-3">Price</th><th className="text-left p-3">Status</th>
                  {canManage && <th className="text-left p-3">Next step</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((a: any) => (
                  <tr key={a.id} className="align-top">
                    <td className="p-3">
                      <p className="font-medium text-gray-900">{a.customerName || 'Unnamed customer'}</p>
                      <p className="text-xs text-gray-600">{humanize(a.customerType)}{a.customerPhone ? ` · ${a.customerPhone}` : ''}</p>
                    </td>
                    <td className="p-3 text-xs">
                      {a.route ? <Link href={`/transport/routes/${a.route.id}`} className="text-brand-700 hover:underline">{a.route.name}</Link> : 'Private transfer'}
                      <p className="text-gray-600">{a.vehicle?.plateNumber ?? '—'}{a.driver ? ` · ${a.driver.firstName} ${a.driver.lastName}` : ''}</p>
                    </td>
                    <td className="p-3 text-xs text-gray-700 whitespace-nowrap">{dateTime(a.scheduledAt)}</td>
                    <td className="p-3">{a.passengerCount}</td>
                    <td className="p-3 font-medium whitespace-nowrap">{sar(a.priceCents, a.currency)}</td>
                    <td className="p-3"><TripStatusBadge status={a.status} /></td>
                    {canManage && <td className="p-3"><TripActions trip={a} onEdit={() => setEditing(a)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <TripModal onClose={() => setCreating(false)} />}
      {editing && <TripModal trip={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
