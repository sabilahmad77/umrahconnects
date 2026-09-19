'use client';

import Link from 'next/link';
import { Users, Plane, Hotel, FileCheck2, DollarSign, Bus, RefreshCw, Wallet, AlertCircle, CheckCircle2, Users2, Calendar, Store, BarChart3, ArrowUpRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQueryClient } from '@tanstack/react-query';
import { Button, QueryFailure } from '@/components/ui/system';
import { useAuthContext } from '@/components/providers/auth-provider';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useBookings, useGroupStats, usePilgrims } from '@/hooks/use-api';
import { useBookingReport, useOverviewReport, useVisaReport } from '@/components/reports/report-queries';
import { VISA_STATUS_META } from '@/hooks/use-visa';
import { humanize, sar } from './workflow-ui';
import { ReadOnlyNotice } from './read-only-notice';

/*
 * The operator home. Every widget reads one API area, so each is shown only
 * to accounts holding that area's read capability — an operator staff member
 * without finance access gets the operational picture instead of an error page.
 */

const QUICK_LINKS: { label: string; href: string; Icon: any; needs: string }[] = [
  { label: 'Pilgrims & CRM', href: '/pilgrims', Icon: Users, needs: 'crm:pilgrim:read' },
  { label: 'Bookings', href: '/bookings', Icon: Calendar, needs: 'booking:booking:read' },
  { label: 'Hotels & Inventory', href: '/hotels', Icon: Hotel, needs: 'hotel:allotment:read' },
  { label: 'Transport', href: '/transport', Icon: Bus, needs: 'transport:vehicle:read' },
  { label: 'Visa & Compliance', href: '/compliance', Icon: FileCheck2, needs: 'visa:application:read' },
  { label: 'Finance', href: '/finance', Icon: DollarSign, needs: 'finance:invoice:read' },
  { label: 'Marketplace', href: '/marketplace', Icon: Store, needs: 'marketplace:listing:read' },
  { label: 'Reports', href: '/reports', Icon: BarChart3, needs: 'reporting:report:read' },
];

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: any }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-50 text-brand-600 mb-4"><Icon className="h-5 w-5" /></div>
      <p className="text-2xl font-bold text-gray-900 leading-none tabular-nums">{value}</p>
      <p className="text-sm text-gray-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export function OperationsPulse() {
  const { user } = useAuthContext();
  const { ready, can } = useCapabilities();
  const qc = useQueryClient();
  const reports = can('reporting:report:read');

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold text-gray-900">{user?.displayName ? `Welcome back, ${user.displayName.split(' ')[0]}` : 'Operations Pulse'}</h1>
          <p className="text-sm text-gray-600 mt-0.5">Activity for {user?.tenantName || 'your organization'}.</p>
        </div>
        <Button variant="quiet" type="button" aria-label="Refresh dashboard" onClick={() => qc.invalidateQueries()} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <section className="border-l-4 border-brand-500 bg-white p-5">
        <h2 className="text-base font-semibold">Operations work queue</h2>
        <p className="mt-2 text-sm text-gray-600">Review bookings, coordinate group departures and follow up on visa documents.</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {can('booking:booking:read') && <Link href="/bookings" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Review bookings</Link>}
          {can('crm:pilgrim:read') && <Link href="/groups" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Coordinate groups</Link>}
          {can('visa:application:read') && <Link href="/compliance" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700">Visa cases</Link>}
        </div>
      </section>

      {reports ? <OverviewKpis /> : ready && <ReadOnlyNotice>Organization figures need the reporting permission.</ReadOnlyNotice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {can('crm:pilgrim:read') && <GroupsWidget />}
        {can('booking:booking:read') && <RecentBookings />}
        {can('crm:pilgrim:read') && <RecentPilgrims />}
      </div>

      {reports && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BookingTrend />
          <VisaPipeline />
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-5" aria-label="Quick navigation">
        <h2 className="font-semibold text-gray-900 mb-4">Quick navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
          {QUICK_LINKS.filter((l) => can(l.needs)).map((l) => (
            <Link key={l.href} href={l.href} className="group flex flex-col items-center gap-2.5 p-3.5 rounded-xl border border-gray-200 text-center hover:shadow-sm transition-all">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-50 text-brand-600"><l.Icon className="h-5 w-5" /></div>
              <span className="text-xs font-semibold text-gray-700 leading-tight">{l.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function OverviewKpis() {
  const { data: o, isLoading, error, refetch } = useOverviewReport();
  if (error) return <QueryFailure error={error} onRetry={() => refetch()} />;
  if (isLoading || !o) return <div role="status" className="grid grid-cols-2 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-32 animate-pulse" />)}</div>;
  const collection = o.financeIncluded && o.revenuePaidCents != null && o.revenueOutstandingCents != null && o.revenuePaidCents + o.revenueOutstandingCents > 0
    ? `${Math.round((o.revenuePaidCents / (o.revenuePaidCents + o.revenueOutstandingCents)) * 100)}% of billed collected` : undefined;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Kpi label="Travelers" value={o.totalPilgrims.toLocaleString()} sub={`${o.activePilgrims} active`} icon={Users} />
        <Kpi label="In the Kingdom now" value={o.inKingdomCount.toLocaleString()} icon={Plane} />
        <Kpi label="Live bookings" value={o.confirmedBookings.toLocaleString()} sub="confirmed to traveling" icon={Calendar} />
        <Kpi label="Open visa cases" value={o.openVisaCases.toLocaleString()} sub="not yet decided" icon={FileCheck2} />
        <Kpi label="Hotels" value={o.hotelCount.toLocaleString()} sub="your organization's" icon={Hotel} />
        <Kpi label="Vehicles" value={o.vehicleCount.toLocaleString()} sub="in service" icon={Bus} />
      </div>
      {o.financeIncluded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl p-5 text-white">
            <p className="text-sm font-medium opacity-80 inline-flex items-center gap-2"><Wallet className="h-5 w-5" /> Collected on invoices</p>
            <p className="text-3xl font-bold mt-3">{sar(o.revenuePaidCents)}</p>
            {collection && <p className="text-xs opacity-80 mt-1">{collection}</p>}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-600 inline-flex items-center gap-2"><AlertCircle className="h-5 w-5 text-orange-800" /> Still owed</p>
            <p className="text-3xl font-bold text-gray-900 mt-3">{sar(o.revenueOutstandingCents)}</p>
            <Link href="/finance" className="flex items-center gap-1 mt-3 text-xs text-brand-700 font-medium">View invoices <ArrowUpRight className="h-3 w-3" /></Link>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupsWidget() {
  const { data, error, refetch } = useGroupStats();
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-600 mb-3 inline-flex items-center gap-1.5"><Users2 className="h-3.5 w-3.5" /> Groups</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : (
        <>
          <p className="text-3xl font-bold text-gray-900">{data?.total ?? '—'}</p>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-100 text-xs">
            <div><span className="text-gray-600 block">Active</span><span className="font-semibold text-green-800">{data?.active ?? '—'}</span></div>
            <div><span className="text-gray-600 block">Completed</span><span className="font-semibold text-blue-700">{data?.completed ?? '—'}</span></div>
            <div><span className="text-gray-600 block">Incidents</span><span className="font-semibold text-red-700">{data?.incidents ?? '—'}</span></div>
          </div>
          <Link href="/groups" className="mt-3 inline-block text-xs text-brand-700 hover:underline">View all groups →</Link>
        </>
      )}
    </div>
  );
}

function RecentBookings() {
  const { data, error, refetch, isLoading } = useBookings({ limit: 5 });
  const items = data?.items ?? [];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-600 mb-3 inline-flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Recent bookings</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : isLoading ? <p className="text-xs text-gray-600">Loading…</p> : items.length === 0 ? <p className="text-xs text-gray-600">No bookings yet.</p> : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((b: any) => (
            <li key={b.id}><Link href={`/bookings/${b.id}`} className="flex items-center justify-between text-xs hover:text-brand-700"><span className="font-medium text-gray-900 truncate">{b.bookingRef ?? b.id.slice(0, 8)}</span><span className="text-gray-600">{humanize(b.status)}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentPilgrims() {
  const { data, error, refetch, isLoading } = usePilgrims({ limit: 5 });
  const items = data?.items ?? [];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-600 mb-3 inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Recent travelers</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : isLoading ? <p className="text-xs text-gray-600">Loading…</p> : items.length === 0 ? <p className="text-xs text-gray-600">No travelers yet.</p> : (
        <ul className="space-y-2">
          {items.slice(0, 5).map((p: any) => (
            <li key={p.id}><Link href={`/pilgrims/${p.id}`} className="flex items-center justify-between text-xs hover:text-brand-700"><span className="font-medium text-gray-900 truncate">{[p.firstNameEn, p.lastNameEn].filter(Boolean).join(' ') || p.firstNameAr || '—'}</span><span className="text-gray-600">{humanize(p.status)}</span></Link></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingTrend() {
  const { data, error, refetch, isLoading } = useBookingReport();
  const trend = (data?.monthlyTrend ?? []).map((t) => ({
    month: new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }), bookings: t.count,
  }));
  return (
    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900">Booking trend</h2>
      <p className="text-xs text-gray-600 mt-0.5 mb-4">New bookings per month, last 6 months</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : isLoading ? <div className="h-48 bg-gray-50 rounded-xl animate-pulse" /> : (data?.total ?? 0) === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-gray-600"><AlertCircle className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No bookings yet</p></div>
      ) : (
        <ResponsiveContainer width="100%" height={192}>
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb' }} formatter={(v: any) => [v, 'Bookings']} />
            <Area type="monotone" dataKey="bookings" stroke="#0F3D37" strokeWidth={2.5} fill="#0F3D37" fillOpacity={0.12} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function VisaPipeline() {
  const { data, error, refetch, isLoading } = useVisaReport();
  const rows = Object.entries(data?.byStatus ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900">Visa pipeline</h2>
      <p className="text-xs text-gray-600 mt-0.5 mb-4">{data ? `${data.total} applications` : ' '}</p>
      {error ? <QueryFailure error={error} onRetry={() => refetch()} /> : isLoading ? <div className="h-40 bg-gray-50 rounded-xl animate-pulse" /> : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-600"><CheckCircle2 className="h-8 w-8 mb-2 opacity-40" /><p className="text-sm">No visa applications yet</p></div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(([status, count]) => {
            const meta = VISA_STATUS_META[status] ?? { label: humanize(status), dot: 'bg-gray-400' };
            const pct = data!.total > 0 ? Math.round((count / data!.total) * 100) : 0;
            return (
              <div key={status}>
                <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-700 inline-flex items-center gap-2"><span aria-hidden="true" className={`w-2 h-2 rounded-full ${meta.dot}`} />{meta.label}</span><span className="text-xs font-semibold text-gray-900">{count}</span></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${meta.dot}`} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          <p className="pt-3 mt-3 border-t border-gray-200 text-xs text-gray-700">{data!.decided ? `${data!.successRate}% of ${data!.decided} decided applications approved` : 'No decisions yet'}</p>
        </div>
      )}
    </div>
  );
}
