'use client';
import { LinkedStatBlock as KPI, CountTile as Tile } from '@/components/ui/system';
import { Button , QueryFailure } from '@/components/ui/system';

import Link from 'next/link';
import {
  Bus, UserCircle2, Map as MapIcon, ClipboardList, ListChecks,
  DollarSign, Wrench, AlertTriangle, RefreshCw, ArrowRight,
  Store, CheckCircle2, Calendar, Loader2, AlertCircle, Plus,
  Wallet, PauseCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTransportStatsFull, useAssignments } from '@/hooks/use-transport';
import { useTransportVehicles, useTransportDrivers, useTransportRoutes } from '@/hooks/use-api';

export function TransportDashboard() {
  const { data: stats, isLoading, error, refetch } = useTransportStatsFull();
  const { data: upcoming , error: assignmentsError, refetch: retryAssignments} = useAssignments({ status: 'SCHEDULED', limit: 6 });

  if (error || assignmentsError) return <QueryFailure error={error || assignmentsError} onRetry={() => { refetch(); retryAssignments(); }} />;
  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport operations</h1>
          <p className="text-sm text-gray-600 mt-0.5">Current records for of your fleet, drivers, routes and bookings</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="quiet" type="button" aria-label="Refresh dashboard" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
          <Link href="/transport/assignments" className="flex items-center gap-2 text-sm px-4 py-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm">
            <Plus className="h-4 w-4" /> New assignment
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          <section className="border-l-4 border-brand-500 bg-white p-5"><h2 className="text-base font-semibold text-gray-900">Assignments and resource availability</h2><p className="mt-2 text-sm text-gray-600">Review scheduled trips and confirm vehicle and driver availability before dispatch.</p><Link href="/transport/assignments" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Open work queue</Link></section>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Vehicles" value={stats.vehicles.total} sub={`${stats.vehicles.available} available`} icon={Bus} color="bg-brand-50 text-brand-700" href="/transport/vehicles" />
            <KPI label="Drivers" value={stats.drivers.total} sub={`${stats.drivers.available} available`} icon={UserCircle2} color="bg-blue-50 text-blue-700" href="/transport/drivers" />
            <KPI label="Routes" value={stats.routes.total} sub={`${stats.routes.active} active`} icon={MapIcon} color="bg-purple-50 text-purple-700" href="/transport/routes" />
            <KPI label="Assignments" value={stats.assignments.total} sub={`${stats.assignments.scheduled} scheduled`} icon={ClipboardList} color="bg-yellow-50 text-yellow-700" href="/transport/assignments" />
          </div>

          {/* Secondary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile label="Available" value={stats.vehicles.available} dot="bg-green-500" />
            <Tile label="Booked" value={stats.vehicles.booked} dot="bg-blue-500" />
            <Tile label="Maintenance" value={stats.vehicles.underMaintenance} dot="bg-yellow-500" />
            <Tile label="Inactive" value={stats.vehicles.inactive} dot="bg-gray-400" />
            <Tile label="In-progress trips" value={stats.assignments.inProgress} dot="bg-orange-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Revenue */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Wallet className="h-4 w-4 text-brand-600" /> Revenue
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.revenue.currency} {(stats.revenue.collectedCents / 100).toLocaleString()}
                </p>
                <p className="text-xs text-green-800 inline-flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3 w-3" /> Collected
                </p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">
                  {stats.revenue.currency} {(stats.revenue.pendingCents / 100).toLocaleString()}
                </p>
                <p className="text-xs text-orange-800 inline-flex items-center gap-1 mt-1">
                  <PauseCircle className="h-3 w-3" /> Pending payments
                </p>
              </div>
              <Link href="/finance" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                Go to finance <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Marketplace */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-purple-600" /> Marketplace
              </h3>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.marketplace.listings}</p>
                <p className="text-xs text-gray-600 mt-1">Active listings</p>
              </div>
              <div className="pt-2 border-t border-gray-50">
                <p className="text-lg font-semibold text-gray-700">{stats.marketplace.openInquiries}</p>
                <p className="text-xs text-blue-600 mt-1">Open inquiries</p>
              </div>
              <Link href="/marketplace" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1">
                Manage listings <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Upcoming trips */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" /> Upcoming trips
              </h3>
              {(stats.assignments.upcoming ?? []).length === 0 ? (
                <p className="text-xs text-gray-600">No upcoming trips</p>
              ) : (
                <ul className="space-y-2">
                  {stats.assignments.upcoming.slice(0, 5).map((u: any) => (
                    <li key={u.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{u.route?.name ?? '—'}</p>
                        <p className="text-xs text-gray-600 truncate">{u.vehicle?.plateNumber ?? '—'}</p>
                      </div>
                      <p className="text-xs text-gray-600 shrink-0">{new Date(u.scheduledAt).toLocaleDateString()}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/transport/assignments" className="text-xs text-brand-500 font-medium hover:underline inline-flex items-center gap-1 mt-3">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/transport/vehicles" label="Vehicles" icon={Bus} bg="bg-brand-50 text-brand-600" />
              <QuickAction href="/transport/drivers" label="Drivers" icon={UserCircle2} bg="bg-blue-50 text-blue-600" />
              <QuickAction href="/transport/routes" label="Routes" icon={MapIcon} bg="bg-purple-50 text-purple-600" />
              <QuickAction href="/transport/assignments" label="Assignments" icon={ClipboardList} bg="bg-yellow-50 text-yellow-800" />
              <QuickAction href="/transport/bookings" label="Bookings" icon={CheckCircle2} bg="bg-blue-50 text-blue-700" />
              <QuickAction href="/marketplace" label="Marketplace" icon={Store} bg="bg-pink-50 text-pink-600" />
              <QuickAction href="/finance" label="Finance" icon={DollarSign} bg="bg-green-50 text-green-800" />
              <QuickAction href="/transport/bookings?status=IN_PROGRESS" label="Active trips" icon={CheckCircle2} bg="bg-orange-50 text-orange-800" />
              <QuickAction href="/transport/vehicles?status=UNDER_MAINTENANCE" label="Maintenance" icon={Wrench} bg="bg-yellow-50 text-yellow-700" />
              <QuickAction href="/social" label="Social Hub" icon={AlertTriangle} bg="bg-saudi-50 text-saudi-700" />
              <QuickAction href="/connections" label="Connections" icon={ListChecks} bg="bg-blue-50 text-blue-700" />
              <QuickAction href="/requests" label="Requests" icon={ListChecks} bg="bg-purple-50 text-purple-700" />
              <QuickAction href="/settings" label="Settings" icon={ListChecks} bg="bg-gray-50 text-gray-700" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}





function QuickAction({ href, label, icon: Icon, bg }: { href: string; label: string; icon: any; bg: string }) {
  return (
    <Link href={href} className="group flex flex-col items-center text-center bg-white border border-gray-200 rounded-xl p-3 hover:border-brand-200 hover:shadow-sm transition-all">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', bg)}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-gray-700 group-hover:text-brand-700">{label}</p>
    </Link>
  );
}
