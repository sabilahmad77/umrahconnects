'use client';

import Link from 'next/link';
import {
  Hotel, BedDouble, DoorOpen, Percent, Wallet, PauseCircle, CalendarCheck2,
  CalendarX2, Store, MessageSquare, RefreshCw, Plus, ArrowRight, Loader2,
  AlertCircle, CheckCircle2, Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHotelOwnerStats } from '@/hooks/use-hotels';

export function HotelDashboard() {
  const { data: stats, isLoading, error, refetch } = useHotelOwnerStats();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hotel operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live view of your hotels, rooms, occupancy, bookings and revenue</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <Link href="/hotels" className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm shadow-brand-500/30">
            <Plus className="h-4 w-4" /> Add hotel
          </Link>
        </div>
      </div>

      {error ? (
        <div className="py-10 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load hotel stats</p>
        </div>
      ) : isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Hotels" value={stats.hotels.total} sub={`${stats.hotels.active} active`} icon={Hotel} color="bg-yellow-50 text-yellow-700" href="/hotels" />
            <KPI label="Rooms" value={stats.rooms.total} sub={`${stats.rooms.roomTypes} room types`} icon={BedDouble} color="bg-brand-50 text-brand-700" href="/hotels" />
            <KPI label="Occupancy" value={`${stats.occupancyRate}%`} sub={`${stats.rooms.booked} booked`} icon={Percent} color="bg-purple-50 text-purple-700" href="/hotels" />
            <KPI label="Bookings" value={stats.bookings.total} sub={`${stats.bookings.pending} pending`} icon={CalendarCheck2} color="bg-blue-50 text-blue-700" href="/hotel-bookings" />
          </div>

          {/* Room status tiles */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Available rooms" value={stats.rooms.available} dot="bg-green-500" />
            <Tile label="Booked rooms" value={stats.rooms.booked} dot="bg-blue-500" />
            <Tile label="Maintenance" value={stats.rooms.maintenance} dot="bg-yellow-500" />
            <Tile label="Pending requests" value={stats.bookings.pending} dot="bg-orange-500" />
            <Tile label="Checked-in" value={stats.bookings.checkedIn} dot="bg-purple-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-600" /> Revenue
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.revenue.currency} {(stats.revenue.collectedCents / 100).toLocaleString()}</p>
                <p className="text-xs text-green-600 inline-flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" /> Collected</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.revenue.currency} {(stats.revenue.outstandingCents / 100).toLocaleString()}</p>
                <p className="text-xs text-orange-500 inline-flex items-center gap-1 mt-1"><PauseCircle className="h-3 w-3" /> Outstanding payments</p>
              </div>
              <Link href="/finance" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                Go to finance <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Upcoming check-ins */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <CalendarCheck2 className="h-4 w-4 text-green-600" /> Upcoming check-ins
              </h3>
              {(stats.upcomingCheckIns ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No check-ins in the next 7 days</p>
              ) : (
                <ul className="space-y-2">
                  {stats.upcomingCheckIns.slice(0, 5).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.guestName}</p>
                        <p className="text-[11px] text-gray-400 truncate">{c.hotel ?? ''}</p>
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">{new Date(c.checkIn).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Upcoming check-outs */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <CalendarX2 className="h-4 w-4 text-orange-600" /> Upcoming check-outs
              </h3>
              {(stats.upcomingCheckOuts ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No check-outs in the next 7 days</p>
              ) : (
                <ul className="space-y-2">
                  {stats.upcomingCheckOuts.slice(0, 5).map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.guestName}</p>
                        <p className="text-[11px] text-gray-400 truncate">{c.hotel ?? ''}</p>
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">{new Date(c.checkOut).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Marketplace */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-2 inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-purple-600" /> Marketplace
              </h3>
              <p className="text-2xl font-bold text-gray-900">{stats.marketplace.activeListings}</p>
              <p className="text-xs text-gray-500">Active listings</p>
              <Link href="/marketplace" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1 mt-3">
                Manage listings <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-600" /> Recent inquiries
              </h3>
              {(stats.marketplace.recentInquiries ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No inquiries yet</p>
              ) : (
                <ul className="space-y-2">
                  {stats.marketplace.recentInquiries.map((i: any) => (
                    <li key={i.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{i.fromName ?? 'Customer'}</p>
                        <p className="text-[11px] text-gray-400 truncate">{i.listingName ?? ''}</p>
                      </div>
                      <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full',
                        i.status === 'NEW' ? 'bg-blue-50 text-blue-600' :
                        i.status === 'RESPONDED' ? 'bg-green-50 text-green-700' :
                        'bg-gray-100 text-gray-500')}>{i.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/hotels" label="My Hotels" icon={Hotel} bg="bg-yellow-50 text-yellow-600" />
              <QuickAction href="/hotels" label="Rooms" icon={BedDouble} bg="bg-brand-50 text-brand-600" />
              <QuickAction href="/hotel-bookings" label="Bookings" icon={CalendarCheck2} bg="bg-blue-50 text-blue-600" />
              <QuickAction href="/marketplace" label="Marketplace" icon={Store} bg="bg-purple-50 text-purple-600" />
              <QuickAction href="/finance" label="Finance" icon={Wallet} bg="bg-green-50 text-green-600" />
              <QuickAction href="/social" label="Social Hub" icon={MessageSquare} bg="bg-pink-50 text-pink-600" />
              <QuickAction href="/connections" label="Connections" icon={DoorOpen} bg="bg-blue-50 text-blue-700" />
              <QuickAction href="/hotels?status=MAINTENANCE" label="Maintenance" icon={Wrench} bg="bg-yellow-50 text-yellow-700" />
              <QuickAction href="/settings" label="Settings" icon={DoorOpen} bg="bg-gray-50 text-gray-700" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, color, href }: { label: string; value: any; sub?: string; icon: any; color: string; href: string }) {
  return (
    <Link href={href} className="bg-white rounded-2xl border border-gray-100 p-4 hover:shadow-md hover:border-brand-200 transition-all flex items-start gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight mt-1">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </Link>
  );
}

function Tile({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', dot)} />
        <p className="text-xs text-gray-500">{label}</p>
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon, bg }: { href: string; label: string; icon: any; bg: string }) {
  return (
    <Link href={href} className="group flex flex-col items-center text-center bg-white border border-gray-100 rounded-xl p-3 hover:border-brand-200 hover:shadow-sm transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', bg)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-gray-700 group-hover:text-brand-700">{label}</p>
    </Link>
  );
}
