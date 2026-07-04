'use client';

import Link from 'next/link';
import {
  Building2, Users, UserCircle2, Hotel, Bus, FileCheck2, Store, Wallet,
  ShieldCheck, MessageSquare, Activity, RefreshCw, Loader2, AlertCircle,
  BookOpen, BarChart3, Cog, FileBarChart, LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStats } from '@/hooks/use-admin';

const fmt = (cents: number, cur = 'SAR') => `${cur} ${((cents ?? 0) / 100).toLocaleString()}`;

export function AdminDashboard() {
  const { data: stats, isLoading, error, refetch } = useAdminStats();

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cross-tenant view of every role, listing, booking and transaction</p>
        </div>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-500">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {error ? (
        <div className="py-10 text-center bg-white rounded-2xl border border-gray-100">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-400 opacity-60" />
          <p className="text-sm text-red-500">Failed to load platform stats</p>
        </div>
      ) : isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Tenants" value={stats.tenants.total} sub={`across ${Object.keys(stats.tenants.byType).length} types`} icon={Building2} color="bg-brand-50 text-brand-700" href="/admin-tenants" />
            <KPI label="Users" value={stats.users} sub="active users" icon={Users} color="bg-blue-50 text-blue-700" href="/admin-users" />
            <KPI label="Bookings" value={stats.bookings} sub="all roles" icon={BookOpen} color="bg-green-50 text-green-700" href="/admin-tenants" />
            <KPI label="Revenue" value={fmt(stats.revenue.collectedCents)} sub={`${fmt(stats.revenue.outstandingCents)} outstanding`} icon={Wallet} color="bg-saudi-50 text-saudi-700" href="/finance" />
          </div>

          {/* Inventory tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <Tile label="Travelers" value={stats.pilgrims} icon={UserCircle2} />
            <Tile label="Operators" value={stats.tenants.byType.OPERATOR ?? 0} icon={Building2} />
            <Tile label="Hotels" value={stats.hotels} icon={Hotel} />
            <Tile label="Transport" value={stats.vehicles} icon={Bus} />
            <Tile label="Pending KYC" value={stats.kyc.pending} icon={ShieldCheck} accent={stats.kyc.pending > 0 ? 'text-yellow-700' : ''} />
            <Tile label="Active listings" value={stats.marketplace.activeListings} icon={Store} />
            <Tile label="Open inquiries" value={stats.marketplace.openInquiries} icon={MessageSquare} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tenants by type */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-brand-600" /> Tenants by type</h3>
              {Object.keys(stats.tenants.byType).length === 0 ? (
                <p className="text-xs text-gray-400">No tenants</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(stats.tenants.byType).map(([type, count]: any) => (
                    <li key={type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{type.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-bold text-gray-900">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Activity className="h-4 w-4 text-blue-600" /> Recent platform activity</h3>
              {(stats.recentActivity ?? []).length === 0 ? (
                <p className="text-xs text-gray-400">No recent activity</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentActivity.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{a.action} · {a.resource}</p>
                        <p className="text-[11px] text-gray-400 truncate">{a.actorEmail ?? '—'}</p>
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">{new Date(a.occurredAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin-logs" className="text-xs text-brand-500 font-medium hover:underline mt-3 inline-block">View all system logs →</Link>
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <QuickAction href="/admin-tenants" label="All Tenants" icon={Building2} bg="bg-brand-50 text-brand-600" />
              <QuickAction href="/admin-users" label="All Users" icon={Users} bg="bg-blue-50 text-blue-600" />
              <QuickAction href="/pilgrims" label="All Pilgrims" icon={UserCircle2} bg="bg-green-50 text-green-600" />
              <QuickAction href="/bookings" label="All Bookings" icon={BookOpen} bg="bg-yellow-50 text-yellow-600" />
              <QuickAction href="/groups" label="All Groups" icon={Users} bg="bg-purple-50 text-purple-600" />
              <QuickAction href="/admin-listings" label="All Listings" icon={Store} bg="bg-pink-50 text-pink-600" />
              <QuickAction href="/admin-kyc" label="KYC Verification" icon={ShieldCheck} bg="bg-yellow-50 text-yellow-700" />
              <QuickAction href="/admin-roles" label="Roles & Permissions" icon={Cog} bg="bg-blue-50 text-blue-700" />
              <QuickAction href="/reports" label="Reports" icon={BarChart3} bg="bg-saudi-50 text-saudi-700" />
              <QuickAction href="/finance" label="Finance" icon={Wallet} bg="bg-green-50 text-green-700" />
              <QuickAction href="/admin-logs" label="System Logs" icon={FileBarChart} bg="bg-gray-50 text-gray-700" />
              <QuickAction href="/admin-settings" label="Settings" icon={Cog} bg="bg-gray-50 text-gray-700" />
              <QuickAction href="/admin-support" label="Support / Issues" icon={LifeBuoy} bg="bg-red-50 text-red-600" />
              <QuickAction href="/social" label="Social Hub" icon={MessageSquare} bg="bg-pink-50 text-pink-700" />
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
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight mt-1 truncate">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        {sub && <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </Link>
  );
}

function Tile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
      </div>
      <p className={cn('text-xl font-bold mt-1', accent || 'text-gray-900')}>{value.toLocaleString()}</p>
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
