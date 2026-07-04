'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Bus, User, Map, BarChart3, Plus, RefreshCw, Search,
  CheckCircle2, XCircle, Clock, AlertCircle, X, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useTransportVehicles, useTransportDrivers,
  useTransportRoutes, useTransportStats,
  useCreateVehicle, useCreateDriver, useCreateRoute,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const VEHICLE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  AVAILABLE:         { label: 'Available',     color: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  BOOKED:            { label: 'Booked',        color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  IN_SERVICE:        { label: 'In Service',    color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500' },
  UNDER_MAINTENANCE: { label: 'Maintenance',   color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  INACTIVE:          { label: 'Inactive',      color: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400' },
};

const DRIVER_STATUS: Record<string, { label: string; color: string }> = {
  AVAILABLE:   { label: 'Available',  color: 'bg-green-100 text-green-700' },
  ASSIGNED:    { label: 'Assigned',   color: 'bg-blue-100 text-blue-700' },
  ON_TRIP:     { label: 'On Trip',    color: 'bg-orange-100 text-orange-700' },
  OFF_DUTY:    { label: 'Off Duty',   color: 'bg-gray-100 text-gray-600' },
  INACTIVE:    { label: 'Inactive',   color: 'bg-red-100 text-red-600' },
};

const TABS = [
  { id: 'vehicles', label: 'Vehicles', icon: Bus },
  { id: 'drivers',  label: 'Drivers',  icon: User },
  { id: 'routes',   label: 'Routes',   icon: Map },
  { id: 'stats',    label: 'Stats',    icon: BarChart3 },
];

const SECTION_META: Record<string, { title: string; subtitle: string }> = {
  vehicles: { title: 'Vehicles & Fleet', subtitle: 'Manage your fleet — add, assign, and track every vehicle' },
  drivers:  { title: 'Drivers', subtitle: 'Manage drivers, licenses, assignments and availability' },
  routes:   { title: 'Routes', subtitle: 'Define transport routes, pricing, schedules and seats' },
  stats:    { title: 'Fleet Stats', subtitle: 'Fleet and driver status overview' },
};

type SectionKey = 'vehicles' | 'drivers' | 'routes' | 'stats';

export function TransportTabs({ fixedSection }: { fixedSection?: SectionKey }) {
  const [tab, setTab] = useState<SectionKey>(fixedSection ?? 'vehicles');
  const [showCreate, setShowCreate] = useState(false);

  const { data: vehicles, isLoading: vl, refetch: rv } = useTransportVehicles();
  const { data: drivers, isLoading: dl, refetch: rd } = useTransportDrivers();
  const { data: routes, isLoading: rl, refetch: rr } = useTransportRoutes();
  const { data: stats, isLoading: sl } = useTransportStats();
  const createVehicle = useCreateVehicle();
  const createDriver  = useCreateDriver();
  const createRoute   = useCreateRoute();

  // Add button label changes per tab
  const addLabel =
    tab === 'drivers' ? 'Add Driver' :
    tab === 'routes'  ? 'Add Route'  : 'Add Vehicle';
  const showAdd = tab !== 'stats';

  const vehicleItems = vehicles?.items ?? [];
  const driverItems = drivers?.items ?? [];

  const meta = fixedSection
    ? SECTION_META[fixedSection]
    : { title: 'Transport Management', subtitle: 'Fleet, drivers, routes & assignments' };

  const refreshActive = () => {
    if (tab === 'vehicles') rv();
    else if (tab === 'drivers') rd();
    else if (tab === 'routes') rr();
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{meta.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{meta.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshActive} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-400 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
          {showAdd && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 transition-colors shadow-sm shadow-brand-500/30"
            >
              <Plus className="h-4 w-4" />
              {addLabel}
            </button>
          )}
        </div>
      </div>

      {/* Tabs — hidden when rendered as a fixed single section */}
      {!fixedSection && (
        <div className="flex gap-1 bg-white border border-gray-200 rounded-2xl p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as SectionKey)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                tab === t.id
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Vehicles ── */}
      {tab === 'vehicles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vl ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse space-y-3">
                <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                <div className="h-4 w-32 bg-gray-100 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            ))
          ) : vehicleItems.length === 0 ? (
            <div className="col-span-3 py-16 text-center bg-white rounded-2xl border border-gray-100">
              <Bus className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No vehicles found</p>
            </div>
          ) : vehicleItems.map((v: any) => {
            const cfg = VEHICLE_STATUS[v.status] ?? { label: v.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
            const primaryDriver = v.drivers?.[0]?.driver;
            return (
              <Link
                key={v.id}
                href={`/transport/vehicles/${v.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                      <Bus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {v.name ?? v.plateNumber ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {v.brand ?? ''} {v.model ?? ''} {v.year ? `· ${v.year}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium mb-3', cfg.color)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                  {cfg.label}
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                  <div><span className="text-gray-400">Plate:</span> <span className="font-medium text-gray-700">{v.plateNumber ?? '—'}</span></div>
                  <div><span className="text-gray-400">Type:</span> <span className="font-medium text-gray-700">{v.type ?? '—'}</span></div>
                  <div><span className="text-gray-400">Seats:</span> <span className="font-medium text-gray-700">{(v.capacity - (v.bookedSeats ?? 0))} / {v.capacity ?? '—'}</span></div>
                  <div><span className="text-gray-400">A/C:</span> <span className="font-medium text-gray-700">{v.hasAc ? 'Yes' : 'No'}</span></div>
                </div>
                {primaryDriver && (
                  <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-50">
                    <span className="text-gray-400">Driver:</span> <span className="font-medium text-gray-700">{primaryDriver.firstName} {primaryDriver.lastName}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Drivers ── */}
      {tab === 'drivers' && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {dl ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-gray-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-36 bg-gray-100 rounded" />
                    <div className="h-3 w-24 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : driverItems.length === 0 ? (
            <div className="py-16 text-center">
              <User className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No drivers found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Driver</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Status</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden md:table-cell">License</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 hidden lg:table-cell">Vehicle</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {driverItems.map((d: any) => {
                  const stt = DRIVER_STATUS[d.status] ?? { label: d.status ?? 'AVAILABLE', color: 'bg-gray-100 text-gray-600' };
                  const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || '—';
                  const primaryVehicle = d.vehicles?.[0]?.vehicle;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer" onClick={() => { window.location.href = `/transport/drivers/${d.id}`; }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 text-xs font-bold shrink-0">
                            {name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{name}</p>
                            <p className="text-xs text-gray-400">{d.phone ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', stt.color)}>{stt.label}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <p className="text-sm font-mono text-gray-700">{d.licenseNumber ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <p className="text-sm text-gray-600">{primaryVehicle?.plateNumber ?? 'Unassigned'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link href={`/transport/drivers/${d.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand-500 font-medium hover:underline">View</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Routes ── */}
      {tab === 'routes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rl ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-28" />
            ))
          ) : !routes || (routes as any[]).length === 0 ? (
            <div className="col-span-2 py-16 text-center bg-white rounded-2xl border border-gray-100">
              <Map className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No routes defined</p>
            </div>
          ) : (((routes as any).items ?? routes) as any[]).map((r: any) => {
            const seats = (r.totalSeats ?? 0) - (r.bookedSeats ?? 0);
            return (
              <Link
                key={r.id}
                href={`/transport/routes/${r.id}`}
                className="block bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-900">{r.name ?? `Route ${r.id?.slice(0, 6)}`}</p>
                  <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    {r.movementType ?? r.type ?? 'Transfer'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{r.originCity ?? r.origin ?? '—'}</span>
                  <span>→</span>
                  <span className="font-medium text-gray-700">{r.destCity ?? r.destination ?? '—'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50 text-[11px]">
                  {r.pricePerSeatCents != null && (
                    <span><span className="text-gray-400">From:</span> <span className="font-medium text-gray-700">{r.currency ?? 'SAR'} {(Number(r.pricePerSeatCents) / 100).toLocaleString()}</span></span>
                  )}
                  {r.totalSeats != null && (
                    <span><span className="text-gray-400">Seats:</span> <span className="font-medium text-gray-700">{seats} / {r.totalSeats}</span></span>
                  )}
                </div>
                {r.distanceKm && (
                  <p className="text-xs text-gray-400 mt-1.5">{r.distanceKm} km · ~{r.durationMins ?? '?'} mins</p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Stats ── */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sl ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse h-40" />
            ))
          ) : !stats ? (
            <div className="col-span-2 py-16 text-center bg-white rounded-2xl border border-gray-100">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 text-gray-200" />
              <p className="text-sm text-gray-400">No stats available</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">🚌 Vehicle Fleet Status</h3>
                <div className="space-y-2.5">
                  {Object.entries((stats as any).vehicles?.byStatus ?? {}).map(([status, count]) => {
                    const cfg = VEHICLE_STATUS[status] ?? { label: status, dot: 'bg-gray-400' };
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                          <span className="text-xs text-gray-600">{cfg.label}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-800">{count as number}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">👨‍✈️ Driver Status</h3>
                <div className="space-y-2.5">
                  {Object.entries((stats as any).drivers?.byStatus ?? {}).map(([status, count]) => {
                    const cfg = DRIVER_STATUS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' };
                    return (
                      <div key={status} className="flex items-center justify-between">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cfg.color)}>{cfg.label}</span>
                        <span className="text-sm font-bold text-gray-800">{count as number}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {showCreate && tab === 'vehicles' && (
        <AddVehicleModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try { await createVehicle.mutateAsync(dto); toast.success('Vehicle added'); setShowCreate(false); rv(); }
            catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Failed'); }
          }}
          pending={createVehicle.isPending}
        />
      )}
      {showCreate && tab === 'drivers' && (
        <AddDriverModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try { await createDriver.mutateAsync(dto); toast.success('Driver added'); setShowCreate(false); rd(); }
            catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Failed'); }
          }}
          pending={createDriver.isPending}
        />
      )}
      {showCreate && tab === 'routes' && (
        <AddRouteModal
          onClose={() => setShowCreate(false)}
          onCreate={async (dto) => {
            try { await createRoute.mutateAsync(dto); toast.success('Route added'); setShowCreate(false); rr(); }
            catch (e: any) { toast.error(e?.response?.data?.error?.message ?? 'Failed'); }
          }}
          pending={createRoute.isPending}
        />
      )}
    </div>
  );
}

// ─── Add-modals ────────────────────────────────────────────────────────────
const VEHICLE_TYPES = ['BUS_LARGE', 'BUS_MEDIUM', 'VAN', 'SEDAN', 'SUV', 'COACH'];
const MOVEMENT_TYPES = ['AIRPORT_PICKUP', 'AIRPORT_DROPOFF', 'MAKKAH_MADINAH', 'MADINAH_MAKKAH', 'ZIYARAT', 'LOCAL', 'MASHAER_MINA', 'MASHAER_ARAFAT', 'MASHAER_MUZDALIFAH'];
const inputCls = 'w-full text-sm px-3 py-2.5 border border-gray-200 rounded-lg focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none bg-white';

function ModalShell({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg"><X className="h-4 w-4 text-gray-500" /></button>
        </div>
        <div className="space-y-3">{children}</div>
        <div className="flex justify-end gap-2 mt-5">{footer}</div>
      </div>
    </div>
  );
}

function AddVehicleModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [type, setType] = useState('BUS_LARGE');
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState('45');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const submit = () => onCreate({ type, plateNumber: plateNumber.trim(), capacity: Number(capacity), make: make || undefined, model: model || undefined, year: year ? Number(year) : undefined });
  return (
    <ModalShell
      title="Add vehicle"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={pending || !plateNumber.trim()} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add vehicle
        </button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Plate number *</span>
          <input autoFocus value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="MKA-3421" className={inputCls} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-600 mb-1">Capacity</span>
          <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} />
        </label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Make</span><input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Mercedes" className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Model</span><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Tourismo" className={inputCls} /></label>
        <label className="block col-span-2"><span className="block text-xs font-semibold text-gray-600 mb-1">Year</span><input type="number" min="1990" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" className={inputCls} /></label>
      </div>
    </ModalShell>
  );
}

function AddDriverModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const submit = () => onCreate({
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    email: email || undefined,
    licenseNumber: licenseNumber || undefined,
    licenseExpiry: licenseExpiry ? new Date(licenseExpiry).toISOString() : undefined,
  });
  return (
    <ModalShell
      title="Add driver"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={pending || !firstName.trim() || !lastName.trim() || !phone.trim()} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add driver
        </button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">First name *</span><input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Last name *</span><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Phone *</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5..." className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">License #</span><input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">License expiry</span><input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className={inputCls} /></label>
      </div>
    </ModalShell>
  );
}

function AddRouteModal({ onClose, onCreate, pending }: { onClose: () => void; onCreate: (dto: any) => Promise<void>; pending: boolean }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('AIRPORT_PICKUP');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [pricePerPax, setPricePerPax] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const submit = () => onCreate({
    name: name.trim(),
    type,
    origin: origin.trim(),
    destination: destination.trim(),
    pricePerPax: pricePerPax ? Number(pricePerPax) : undefined,
    distanceKm: distanceKm ? Number(distanceKm) : undefined,
    estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined,
    currency: 'SAR',
  });
  return (
    <ModalShell
      title="Add route"
      onClose={onClose}
      footer={<>
        <button onClick={onClose} disabled={pending} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={pending || !name.trim() || !origin.trim() || !destination.trim()} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 shadow-sm">
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Add route
        </button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2"><span className="block text-xs font-semibold text-gray-600 mb-1">Route name *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="JED Airport → Makkah" className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {MOVEMENT_TYPES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Price per pax (SAR)</span><input type="number" min="0" value={pricePerPax} onChange={(e) => setPricePerPax(e.target.value)} placeholder="150" className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Origin *</span><input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Jeddah" className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Destination *</span><input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Makkah" className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Distance (km)</span><input type="number" min="0" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className="block text-xs font-semibold text-gray-600 mb-1">Duration (min)</span><input type="number" min="0" value={estimatedDuration} onChange={(e) => setEstimatedDuration(e.target.value)} className={inputCls} /></label>
      </div>
    </ModalShell>
  );
}
