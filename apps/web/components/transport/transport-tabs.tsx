'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bus, User, Map, Plus, RefreshCw, Search } from 'lucide-react';
import { Button, Input, LoadingState, QueryFailure } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useDriverList, useRouteList, useVehicleList } from '@/hooks/use-transport';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { dateTime, humanize, sar, shortDate } from '@/components/dashboard/workflow-ui';
import { cn } from '@/lib/utils';
import { DriverFormModal, RouteFormModal, VehicleFormModal } from './fleet-forms';

type SectionKey = 'vehicles' | 'drivers' | 'routes';

const SECTION_META: Record<SectionKey, { title: string; subtitle: string; add: string; icon: any }> = {
  vehicles: { title: 'Vehicles & Fleet', subtitle: 'Your fleet: capacity, status and the trips each vehicle carries', add: 'Add vehicle', icon: Bus },
  drivers: { title: 'Drivers', subtitle: 'Drivers, licences and availability', add: 'Add driver', icon: User },
  routes: { title: 'Routes', subtitle: 'Scheduled routes: seats for sale, pricing and departures', add: 'Add route', icon: Map },
};

export const VEHICLE_TONE: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800', BOOKED: 'bg-blue-100 text-blue-700', IN_SERVICE: 'bg-orange-100 text-orange-800',
  UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-800', INACTIVE: 'bg-gray-100 text-gray-600',
};
export const DRIVER_TONE: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-800', ASSIGNED: 'bg-blue-100 text-blue-700', ON_TRIP: 'bg-orange-100 text-orange-800',
  OFF_DUTY: 'bg-gray-100 text-gray-700', INACTIVE: 'bg-red-100 text-red-700',
};
export const ROUTE_TONE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700', ACTIVE: 'bg-green-100 text-green-800', FULLY_BOOKED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-gray-100 text-gray-700', CANCELLED: 'bg-red-100 text-red-700', INACTIVE: 'bg-gray-100 text-gray-600',
};
export function StatusPill({ status, tone }: { status: string; tone: Record<string, string> }) {
  return <span className={cn('inline-flex text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap', tone[status] ?? 'bg-gray-100 text-gray-700')}>{humanize(status)}</span>;
}

/** Licence status for a driver, from the expiry date. */
export function licenceNote(expiry?: string | null): { text: string; tone: string } | null {
  if (!expiry) return null;
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Licence expired ${shortDate(expiry)}`, tone: 'text-red-700' };
  if (days <= 30) return { text: `Licence expires ${shortDate(expiry)}`, tone: 'text-orange-800' };
  return { text: `Licence valid to ${shortDate(expiry)}`, tone: 'text-gray-600' };
}

export function TransportTabs({ fixedSection = 'vehicles' }: { fixedSection?: SectionKey }) {
  const { ready, can } = useCapabilities();
  const canManage = can('transport:vehicle:manage');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const meta = SECTION_META[fixedSection];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{meta.title}</h1>
          <p className="text-sm text-gray-600 mt-0.5">{meta.subtitle}</p>
        </div>
        {canManage && <Button type="button" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {meta.add}</Button>}
      </div>
      {ready && !canManage && <ReadOnlyNotice>You can view the fleet. Adding or changing vehicles, drivers and routes needs the fleet management permission.</ReadOnlyNotice>}

      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-80">
        <Search className="h-4 w-4 text-gray-600" />
        <Input aria-label={`Search ${meta.title.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="text-sm bg-transparent flex-1 outline-none border-0 p-0 min-h-0" />
      </div>

      {fixedSection === 'vehicles' && <VehiclesSection search={search.trim()} />}
      {fixedSection === 'drivers' && <DriversSection search={search.trim()} />}
      {fixedSection === 'routes' && <RoutesSection search={search.trim()} />}

      {adding && fixedSection === 'vehicles' && <VehicleFormModal onClose={() => setAdding(false)} />}
      {adding && fixedSection === 'drivers' && <DriverFormModal onClose={() => setAdding(false)} />}
      {adding && fixedSection === 'routes' && <RouteFormModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function RefreshBar({ total, noun, onRefresh, loading }: { total: number; noun: string; onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-gray-600">{total} {noun}{total === 1 ? '' : 's'}</p>
      <Button variant="quiet" type="button" aria-label={`Refresh ${noun}s`} onClick={onRefresh} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
      </Button>
    </div>
  );
}

function VehiclesSection({ search }: { search: string }) {
  const { data, isLoading, error, refetch, isFetching } = useVehicleList({ limit: 100, search: search || undefined });
  const items = data?.items ?? [];
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading vehicles…" />;
  return (
    <section className="space-y-3" aria-label="Vehicles">
      <RefreshBar total={data?.total ?? 0} noun="vehicle" onRefresh={() => refetch()} loading={isFetching} />
      {items.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200"><Bus className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-sm text-gray-600">No vehicles found</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((v: any) => {
            const primary = v.drivers?.find((d: any) => d.isPrimary)?.driver ?? v.drivers?.[0]?.driver;
            return (
              <Link key={v.id} href={`/transport/vehicles/${v.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{v.plateNumber}{v.name ? ` · ${v.name}` : ''}</p>
                    <p className="text-xs text-gray-600 truncate">{humanize(v.type)}{v.brand || v.model ? ` · ${[v.brand, v.model].filter(Boolean).join(' ')}` : ''}{v.year ? ` · ${v.year}` : ''}</p>
                  </div>
                  <StatusPill status={v.isActive === false ? 'INACTIVE' : v.status} tone={VEHICLE_TONE} />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                  <div><dt className="text-gray-600">Seats</dt><dd className="font-semibold">{v.capacity}</dd></div>
                  <div><dt className="text-gray-600">Open trips</dt><dd className="font-semibold">{v._count?.assignments ?? 0} ({v.bookedSeats} pax)</dd></div>
                </dl>
                <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100">Driver: {primary ? `${primary.firstName} ${primary.lastName}` : 'none assigned'}</p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function DriversSection({ search }: { search: string }) {
  const { data, isLoading, error, refetch, isFetching } = useDriverList({ limit: 100, search: search || undefined });
  const items = data?.items ?? [];
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading drivers…" />;
  return (
    <section className="space-y-3" aria-label="Drivers">
      <RefreshBar total={data?.total ?? 0} noun="driver" onRefresh={() => refetch()} loading={isFetching} />
      {items.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200"><User className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-sm text-gray-600">No drivers found</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200">
          <div role="region" aria-label="Drivers" tabIndex={0} className="max-w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                <tr><th className="text-left px-4 py-3">Driver</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Licence</th><th className="text-left px-4 py-3">Vehicle</th><th className="text-left px-4 py-3">Open trips</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((d: any) => {
                  const lic = licenceNote(d.licenseExpiry);
                  const vehicle = d.vehicles?.find((x: any) => x.isPrimary)?.vehicle ?? d.vehicles?.[0]?.vehicle;
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-3">
                        <Link href={`/transport/drivers/${d.id}`} className="font-semibold text-brand-700 hover:underline">{d.firstName} {d.lastName}</Link>
                        <p className="text-xs text-gray-600">{d.phone}</p>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={d.isActive === false ? 'INACTIVE' : d.status} tone={DRIVER_TONE} /></td>
                      <td className="px-4 py-3 text-xs"><p className="font-mono text-gray-800">{d.licenseNumber ?? '—'}</p>{lic && <p className={lic.tone}>{lic.text}</p>}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{vehicle?.plateNumber ?? 'Unassigned'}</td>
                      <td className="px-4 py-3">{d._count?.assignments ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function RoutesSection({ search }: { search: string }) {
  const { data, isLoading, error, refetch, isFetching } = useRouteList({ limit: 100, search: search || undefined });
  const items = data?.items ?? [];
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading routes…" />;
  return (
    <section className="space-y-3" aria-label="Routes">
      <RefreshBar total={data?.total ?? 0} noun="route" onRefresh={() => refetch()} loading={isFetching} />
      {items.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-200"><Map className="h-12 w-12 mx-auto mb-3 text-gray-300" /><p className="text-sm text-gray-600">No routes found</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((r: any) => (
            <Link key={r.id} href={`/transport/routes/${r.id}`} className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-brand-200 transition-all">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-600">{r.originCity} → {r.destCity} · {humanize(r.movementType)}</p>
                </div>
                <StatusPill status={r.status} tone={ROUTE_TONE} />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs text-gray-700 pt-2 border-t border-gray-100">
                <div><dt className="text-gray-600">Seats sold</dt><dd className="font-semibold">{r.bookedSeats}{r.totalSeats != null ? ` / ${r.totalSeats}` : ''}</dd></div>
                <div><dt className="text-gray-600">Per seat</dt><dd className="font-semibold">{r.pricePerSeatCents != null ? sar(r.pricePerSeatCents, r.currency) : '—'}</dd></div>
                <div><dt className="text-gray-600">Departure</dt><dd className="font-semibold">{r.departureAt ? dateTime(r.departureAt) : 'On request'}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
