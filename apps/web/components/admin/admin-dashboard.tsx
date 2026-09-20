'use client';
import { LinkedStatBlock as KPI } from '@/components/ui/system';
import { Button , QueryFailure, StatBlock } from '@/components/ui/system';

import Link from 'next/link';
import {
  Building2, Users, UserCircle2, Hotel, Bus, FileCheck2, Store, Wallet,
  ShieldCheck, MessageSquare, Activity, RefreshCw, Loader2, AlertCircle,
  BookOpen, BarChart3, Cog, FileBarChart, LifeBuoy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStats } from '@/hooks/use-admin';
import { useCapabilities } from '@/hooks/use-capabilities';

const fmt = (cents: number, cur = 'SAR') => `${cur} ${((cents ?? 0) / 100).toLocaleString()}`;

/** Shortcuts into the console; each one is shown only when the account can open it. */
const QUICK_ACTIONS = [
  { href: '/admin-tenants', label: 'All Tenants', icon: Building2, bg: 'bg-brand-50 text-brand-600' },
  { href: '/admin-users', label: 'All Users', icon: Users, bg: 'bg-blue-50 text-blue-600' },
  { href: '/admin-listings', label: 'All Listings', icon: Store, bg: 'bg-pink-50 text-pink-600' },
  { href: '/admin-kyc', label: 'KYC Verification', icon: ShieldCheck, bg: 'bg-yellow-50 text-yellow-700' },
  { href: '/admin-roles', label: 'Roles & Permissions', icon: Cog, bg: 'bg-blue-50 text-blue-700' },
  { href: '/admin-logs', label: 'System Logs', icon: FileBarChart, bg: 'bg-gray-50 text-gray-700' },
  { href: '/admin-settings', label: 'Settings', icon: Cog, bg: 'bg-gray-50 text-gray-700' },
  { href: '/admin-support', label: 'Support / Issues', icon: LifeBuoy, bg: 'bg-red-50 text-red-700' },
];

export function AdminDashboard() {
  const { data: stats, isLoading, error, refetch } = useAdminStats();
  const { canOpen } = useCapabilities();

  if (error) return <QueryFailure error={error} onRetry={() => { refetch(); }} />;
  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform overview</h1>
          <p className="text-sm text-gray-600 mt-0.5">Cross-tenant view of every role, listing, booking and transaction</p>
        </div>
        <Button variant="quiet" type="button" aria-label="Refresh dashboard" onClick={() => refetch()} className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {isLoading || !stats ? (
        <div className="flex items-center justify-center py-12 text-gray-600 text-sm">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading dashboard…
        </div>
      ) : (
        <>
          <section className="border-l-4 border-brand-500 bg-white p-5"><h2 className="text-base font-semibold text-gray-900">Platform governance</h2><p className="mt-2 text-sm text-gray-600">Review organization verification, platform users and listing moderation across tenants.</p><Link href={stats.kyc.pending > 0 && canOpen('/admin-kyc') ? '/admin-kyc' : '/admin-tenants'} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">{stats.kyc.pending > 0 ? `Review ${stats.kyc.pending} pending verification${stats.kyc.pending === 1 ? '' : 's'}` : 'Open work queue'}</Link></section>
          {/* Hero KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Tenants" value={stats.tenants.total} sub={`across ${Object.keys(stats.tenants.byType).length} types`} icon={Building2} color="bg-brand-50 text-brand-700" href="/admin-tenants" />
            <KPI label="Users" value={stats.users} sub="current accounts" icon={Users} color="bg-blue-50 text-blue-700" href="/admin-users" />
            <StatBlock label="Bookings" value={stats.bookings} description="Across organizations" />
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
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-brand-600" /> Tenants by type</h3>
              {Object.keys(stats.tenants.byType).length === 0 ? (
                <p className="text-xs text-gray-600">No tenants</p>
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
            <div className="bg-white rounded-xl border border-gray-200 p-5 lg:col-span-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center gap-2"><Activity className="h-4 w-4 text-blue-600" /> Recent platform activity</h3>
              {(stats.recentActivity ?? []).length === 0 ? (
                <p className="text-xs text-gray-600">No recent activity</p>
              ) : (
                <ul className="space-y-2">
                  {stats.recentActivity.map((a: any) => (
                    <li key={a.id} className="flex items-center justify-between text-xs border-b border-gray-50 pb-2 last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{a.action} · {a.resource}</p>
                        <p className="text-xs text-gray-600 truncate">{a.actorEmail ?? '—'}</p>
                      </div>
                      <span className="text-xs text-gray-600 shrink-0">{new Date(a.occurredAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin-logs" className="text-xs text-brand-500 font-medium hover:underline mt-3 inline-block">View all system logs →</Link>
            </div>
          </div>

          {/* Quick navigation */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Quick navigation</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {QUICK_ACTIONS.filter((action) => canOpen(action.href)).map((action) => (
                <QuickAction key={action.href} {...action} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}



function Tile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: any; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-gray-600" />
        <p className="text-xs text-gray-600 truncate">{label}</p>
      </div>
      <p className={cn('text-xl font-bold mt-1', accent || 'text-gray-900')}>{value.toLocaleString()}</p>
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
