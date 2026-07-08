'use client';

import {
  Users, Plane, Hotel, FileCheck2, DollarSign, Bus,
  TrendingUp, TrendingDown, ArrowUpRight, RefreshCw,
  Wallet, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useReportsOverview, useReportsBookings, useReportsVisa, useGroupStats, useBookings, usePilgrims } from '@/hooks/use-api';
import { useAuthContext } from '@/components/providers/auth-provider';
import Link from 'next/link';

const VISA_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  NOT_STARTED:             { label: 'Not Started',        color: 'bg-gray-100 text-gray-600',  dot: 'bg-gray-400' },
  DOCUMENTS_COLLECTING:    { label: 'Docs Collecting',    color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  SUBMITTED:               { label: 'Submitted',          color: 'bg-blue-100 text-blue-700',  dot: 'bg-blue-500' },
  UNDER_REVIEW:            { label: 'Under Review',       color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  APPROVED:                { label: 'Approved',           color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  REJECTED:                { label: 'Rejected',           color: 'bg-red-100 text-red-700',    dot: 'bg-red-500' },
  EXPIRED:                 { label: 'Expired',            color: 'bg-gray-100 text-gray-500',  dot: 'bg-gray-400' },
};

function KpiCard({
  label, value, sub, icon: Icon, iconBg, trend, trendUp,
}: {
  label: string; value: string; sub?: string;
  icon: any; iconBg: string; trend?: string; trendUp?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${trendUp ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SkeletonKpi() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-gray-100 mb-4" />
      <div className="h-7 w-24 bg-gray-100 rounded mb-2" />
      <div className="h-4 w-20 bg-gray-100 rounded" />
    </div>
  );
}

import { Users2, Calendar, Store, BarChart3 } from 'lucide-react';

const BRAND_TINT = 'bg-brand-50 text-brand-600';
const GOLD_TINT = 'bg-gold-50 text-gold-600';
const QUICK_LINKS: { label: string; href: string; Icon: any; tint: string }[] = [
  { label: 'Pilgrims & CRM',     href: '/pilgrims',    Icon: Users,       tint: BRAND_TINT },
  { label: 'Bookings',           href: '/bookings',    Icon: Calendar,    tint: GOLD_TINT },
  { label: 'Hotels & Inventory', href: '/hotels',      Icon: Hotel,       tint: BRAND_TINT },
  { label: 'Transport Fleet',    href: '/transport',   Icon: Bus,         tint: GOLD_TINT },
  { label: 'Visa & Compliance',  href: '/compliance',  Icon: FileCheck2,  tint: BRAND_TINT },
  { label: 'Finance',            href: '/finance',     Icon: DollarSign,  tint: GOLD_TINT },
  { label: 'Marketplace',        href: '/marketplace', Icon: Store,       tint: BRAND_TINT },
  { label: 'Reports',            href: '/reports',     Icon: BarChart3,   tint: GOLD_TINT },
];

// Brand-aligned chart palette (deep green, gold, emerald, navy, sandstone, muted red)
const CHART_COLORS = ['#0F3D37', '#C8A96B', '#2A7A6B', '#112234', '#B08D57', '#B54747'];

export function OperationsPulse() {
  const { user } = useAuthContext();
  const { data: overview, isLoading: overviewLoading, refetch } = useReportsOverview();
  const { data: bookingsReport, isLoading: bookingsLoading } = useReportsBookings();
  const { data: visaReport, isLoading: visaLoading } = useReportsVisa();
  const { data: groupStats } = useGroupStats();
  const { data: recentBookings } = useBookings({ limit: 5 });
  const { data: recentPilgrims } = usePilgrims({ limit: 5 });

  const fmtSAR = (cents?: number) =>
    cents !== undefined ? `SAR ${(cents / 100).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';

  const trendData = bookingsReport?.monthlyTrend?.map((t: any) => ({
    month: t.month?.slice(0, 3) ?? '',
    bookings: t.count ?? 0,
  })) ?? [];

  const visaEntries = visaReport?.byStatus
    ? Object.entries(visaReport.byStatus as Record<string, number>)
        .sort((a, b) => b[1] - a[1])
    : [];

  const totalVisa = visaEntries.reduce((sum, [, v]) => sum + v, 0);

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">
            {user?.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}` : 'Operations Pulse'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Here&apos;s what&apos;s happening across {user?.tenantName || 'your Umrah ecosystem'} today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            All systems live
          </span>
          <button
            onClick={() => refetch()}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {overviewLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonKpi key={i} />)
        ) : (
          <>
            <KpiCard
              label="Total Pilgrims"
              value={overview?.totalPilgrims?.toLocaleString() ?? '—'}
              sub={`${overview?.activePilgrims ?? 0} active`}
              icon={Users}
              iconBg="bg-brand-50 text-brand-600"
              trend="+12%"
              trendUp
            />
            <KpiCard
              label="In Kingdom Now"
              value={overview?.inKingdomCount?.toLocaleString() ?? '0'}
              icon={Plane}
              iconBg="bg-brand-50 text-brand-600"
            />
            <KpiCard
              label="Bookings"
              value={overview?.confirmedBookings?.toLocaleString() ?? '—'}
              sub="confirmed"
              icon={FileCheck2}
              iconBg="bg-brand-50 text-brand-600"
              trend="+8%"
              trendUp
            />
            <KpiCard
              label="Hotels"
              value={overview?.hotelCount?.toLocaleString() ?? '—'}
              sub="in network"
              icon={Hotel}
              iconBg="bg-gold-50 text-gold-600"
            />
            <KpiCard
              label="Vehicles"
              value={overview?.vehicleCount?.toLocaleString() ?? '—'}
              sub="in fleet"
              icon={Bus}
              iconBg="bg-gold-50 text-gold-600"
            />
            <KpiCard
              label="Revenue Paid"
              value={fmtSAR(overview?.revenuePaidCents)}
              sub={`${fmtSAR(overview?.revenueOutstandingCents)} outstanding`}
              icon={DollarSign}
              iconBg="bg-gold-50 text-gold-600"
              trend="+18%"
              trendUp
            />
          </>
        )}
      </div>

      {/* Secondary KPIs: Groups + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-3 inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Groups
          </p>
          <p className="text-3xl font-bold text-gray-900">{groupStats?.total ?? 0}</p>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-50 text-xs">
            <div><span className="text-gray-400 block">Active</span><span className="font-semibold text-green-700">{groupStats?.active ?? 0}</span></div>
            <div><span className="text-gray-400 block">Completed</span><span className="font-semibold text-blue-700">{groupStats?.completed ?? 0}</span></div>
            <div><span className="text-gray-400 block">Incidents</span><span className="font-semibold text-red-600">{groupStats?.incidents ?? 0}</span></div>
          </div>
          <Link href="/groups" className="mt-3 inline-block text-xs text-brand-500 hover:underline">View all groups →</Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-3 inline-flex items-center gap-1.5">
            <FileCheck2 className="h-3.5 w-3.5" /> Recent bookings
          </p>
          {(recentBookings?.items ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">No bookings yet</p>
          ) : (
            <ul className="space-y-2">
              {recentBookings!.items.slice(0, 5).map((b: any) => (
                <li key={b.id}>
                  <Link href={`/bookings/${b.id}`} className="flex items-center justify-between text-xs hover:text-brand-600">
                    <span className="font-medium text-gray-900 truncate">{b.bookingRef ?? b.id.slice(0, 8)}</span>
                    <span className="text-[10px] text-gray-500">{b.status?.replace(/_/g, ' ')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs font-semibold text-gray-500 mb-3 inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Recent pilgrims
          </p>
          {(recentPilgrims?.items ?? []).length === 0 ? (
            <p className="text-xs text-gray-400">No pilgrims yet</p>
          ) : (
            <ul className="space-y-2">
              {recentPilgrims!.items.slice(0, 5).map((p: any) => {
                const name = [p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || '—';
                return (
                  <li key={p.id}>
                    <Link href={`/pilgrims/${p.id}`} className="flex items-center justify-between text-xs hover:text-brand-600">
                      <span className="font-medium text-gray-900 truncate">{name}</span>
                      <span className="text-[10px] text-gray-500">{p.status?.replace(/_/g, ' ')}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Booking Trend */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-gray-900">Booking Trend</h3>
              <p className="text-xs text-gray-400 mt-0.5">Monthly confirmed bookings</p>
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg">Last 12 months</span>
          </div>
          {bookingsLoading ? (
            <div className="h-48 bg-gray-50 rounded-xl animate-pulse" />
          ) : trendData.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-400">
              <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No booking data yet</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="bookGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(v: any) => [v.toLocaleString(), 'Bookings']}
                />
                <Area type="monotone" dataKey="bookings" stroke="#2563EB" strokeWidth={2.5} fill="url(#bookGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Visa Pipeline */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="mb-5">
            <h3 className="font-semibold text-gray-900">Visa Pipeline</h3>
            <p className="text-xs text-gray-400 mt-0.5">{visaReport?.total ?? totalVisa} total applications</p>
          </div>
          {visaLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-gray-200" />
                  <div className="h-3 flex-1 bg-gray-100 rounded" />
                  <div className="h-4 w-8 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ) : visaEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CheckCircle2 className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">No visa data</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {visaEntries.map(([status, count]) => {
                const cfg = VISA_STATUS_CONFIG[status] ?? { label: status.replace(/_/g, ' '), dot: 'bg-gray-400' };
                const pct = totalVisa > 0 ? Math.round((count / totalVisa) * 100) : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-xs text-gray-600">{cfg.label}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-900">{count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${cfg.dot}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {visaReport?.successRate !== undefined && (
                <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Approval rate</span>
                  <span className="text-sm font-bold text-green-600">{Number(visaReport.successRate).toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick Navigation */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Quick Navigation</h3>
          <p className="text-xs text-gray-400">Jump to any module</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col items-center gap-2.5 p-3.5 rounded-xl border border-gray-100 text-center hover:border-gray-200 hover:shadow-sm transition-all"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${link.tint} group-hover:scale-105 transition-transform`}>
                <link.Icon className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-semibold text-gray-700 leading-tight">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-5 w-5 opacity-80" />
            <p className="text-sm font-medium opacity-80">Total Revenue</p>
          </div>
          <p className="text-3xl font-bold">{fmtSAR(overview?.revenuePaidCents)}</p>
          <p className="text-xs opacity-70 mt-1">This season</p>
          <div className="flex items-center gap-1.5 mt-3 text-xs">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>+18% vs last season</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <p className="text-sm font-medium text-gray-600">Outstanding</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fmtSAR(overview?.revenueOutstandingCents)}</p>
          <p className="text-xs text-gray-400 mt-1">Pending collection</p>
          <Link href="/finance" className="flex items-center gap-1 mt-3 text-xs text-brand-500 hover:text-brand-600 font-medium">
            View invoices <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <p className="text-sm font-medium text-gray-600">Collection Rate</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {overview?.revenuePaidCents && overview?.revenueOutstandingCents
              ? `${Math.round((overview.revenuePaidCents / (overview.revenuePaidCents + overview.revenueOutstandingCents)) * 100)}%`
              : '—'
            }
          </p>
          <p className="text-xs text-gray-400 mt-1">Paid vs total billed</p>
          <Link href="/reports" className="flex items-center gap-1 mt-3 text-xs text-brand-500 hover:text-brand-600 font-medium">
            Full analytics <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
