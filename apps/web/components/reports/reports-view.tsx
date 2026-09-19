'use client';

import { useState } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Users, BookOpen, DollarSign, FileCheck2, Download, Hotel, Bus } from 'lucide-react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api-error';
import { Button, QueryFailure } from '@/components/ui/system';
import { useCapabilities } from '@/hooks/use-capabilities';
import { useAuthContext } from '@/components/providers/auth-provider';
import { ReadOnlyNotice } from '@/components/dashboard/read-only-notice';
import { humanize, sar } from '@/components/dashboard/workflow-ui';
import {
  downloadReportCsv, useBookingReport, useFinanceReport, useHotelReport, useOverviewReport, usePilgrimReport,
  useTransportReport, useVisaReport,
} from './report-queries';

const COLORS = ['#0F3D37', '#C8A96B', '#2A7A6B', '#112234', '#B08D57', '#B54747', '#3b82f6', '#8b5cf6'];

function Section({ title, icon: Icon, query, empty, children }: { title: string; icon?: any; query: { isLoading: boolean; error: unknown; refetch: () => void }; empty?: boolean; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5" aria-label={title}>
      <h2 className="font-semibold text-gray-900 mb-4 inline-flex items-center gap-2">{Icon && <Icon className="h-4 w-4 text-gray-600" />}{title}</h2>
      {query.error ? <QueryFailure error={query.error} onRetry={() => query.refetch()} />
        : query.isLoading ? <div role="status" className="h-40 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-600 text-sm">Loading…</div>
          : empty ? <p className="text-sm text-gray-600 py-8 text-center">No records yet.</p>
            : children}
    </section>
  );
}

const entries = (o?: Record<string, number>) => Object.entries(o ?? {}).filter(([, v]) => v > 0).map(([name, value]) => ({ name: humanize(name), value }));

function Tiles({ items }: { items: { label: string; value: React.ReactNode; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((t) => (
        <div key={t.label} className="rounded-xl bg-gray-50 p-3">
          <dt className="text-xs text-gray-600">{t.label}</dt>
          <dd className="text-xl font-bold text-gray-900 tabular-nums">{t.value}</dd>
          {t.note && <dd className="text-xs text-gray-600">{t.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function ReportsView() {
  const { user } = useAuthContext();
  const { ready, can } = useCapabilities();
  const canRead = can('reporting:report:read');
  const canFinance = can('finance:report:read');
  const canExport = canRead && can('reporting:report:export');
  const overview = useOverviewReport(canRead);
  const pilgrims = usePilgrimReport(canRead);
  const bookings = useBookingReport(canRead);
  const hotels = useHotelReport(canRead);
  const visa = useVisaReport(canRead);
  const transport = useTransportReport(canRead);
  const finance = useFinanceReport(canFinance);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try { await downloadReportCsv(); toast.success('Report exported'); }
    catch (e) { toast.error(apiErrorMessage(e, 'The report could not be exported.')); }
    finally { setExporting(false); }
  };

  if (ready && !canRead) {
    return <ReadOnlyNotice>Reports need the reporting permission. Ask your organization administrator for access.</ReadOnlyNotice>;
  }
  const o = overview.data;
  const trend = (bookings.data?.monthlyTrend ?? []).map((t) => ({
    month: new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    count: t.count,
  }));
  const pilgrimData = entries(pilgrims.data?.byStatus);
  const visaData = entries(visa.data?.byStatus);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-600 mt-0.5">Figures for {user?.tenantName || 'your organization'}, computed from its own records</p>
        </div>
        {canExport && <Button variant="secondary" type="button" busy={exporting} onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>}
      </div>
      {ready && !canFinance && <ReadOnlyNotice>Money figures are shown to accounts with the finance reporting permission; this report shows operational figures only.</ReadOnlyNotice>}

      <Section title="Overview" query={overview}>
        {o && (
          <Tiles items={[
            { label: 'Travelers', value: o.totalPilgrims.toLocaleString(), note: `${o.activePilgrims} active · ${o.inKingdomCount} in the Kingdom` },
            { label: 'Live bookings', value: o.confirmedBookings.toLocaleString(), note: 'confirmed to traveling' },
            { label: 'Open visa cases', value: o.openVisaCases.toLocaleString(), note: 'not yet decided' },
            o.financeIncluded
              ? { label: 'Collected', value: sar(o.revenuePaidCents), note: `${sar(o.revenueOutstandingCents)} still owed on invoices` }
              : { label: 'Hotels · vehicles', value: `${o.hotelCount} · ${o.vehicleCount}`, note: 'in your organization' },
          ]} />
        )}
      </Section>

      <Section title="Bookings per month (last 6 months)" icon={BookOpen} query={bookings} empty={(bookings.data?.total ?? 0) === 0}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#4b5563' }} axisLine={false} tickLine={false} width={32} />
            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v: any) => [v, 'Bookings']} />
            <Area type="monotone" dataKey="count" stroke="#0F3D37" strokeWidth={2.5} fill="#0F3D37" fillOpacity={0.12} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Travelers by status" icon={Users} query={pilgrims} empty={pilgrimData.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pilgrimData} layout="vertical" margin={{ left: 4, right: 4 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: '#4b5563' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>{pilgrimData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          {pilgrims.data && <p className="text-xs text-gray-600 mt-2">{pilgrims.data.byGender.MALE ?? 0} male · {pilgrims.data.byGender.FEMALE ?? 0} female</p>}
        </Section>

        <Section title="Visa pipeline" icon={FileCheck2} query={visa} empty={(visa.data?.total ?? 0) === 0}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={visaData} dataKey="value" nameKey="name" cx="40%" cy="50%" outerRadius={75} innerRadius={45}>{visaData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} formatter={(v: any) => [v, 'Applications']} />
            </PieChart>
          </ResponsiveContainer>
          {visa.data && <p className="text-xs text-gray-600 mt-2">{visa.data.decided ? `${visa.data.successRate}% of ${visa.data.decided} decided applications approved` : 'No decisions yet'} · {visa.data.total} applications</p>}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Hotels" icon={Hotel} query={hotels} empty={!!hotels.data && hotels.data.totalHotels === 0 && hotels.data.allotments.contracts === 0}>
          {hotels.data && (
            <Tiles items={[
              { label: 'Rooms in service', value: hotels.data.rooms.total, note: `${hotels.data.rooms.occupancyRate}% occupied now` },
              { label: 'Guest bookings', value: hotels.data.bookings.total, note: `${hotels.data.bookings.byStatus.CHECKED_IN ?? 0} checked in` },
              { label: 'Contracted rooms', value: hotels.data.allotments.totalRooms, note: `${hotels.data.allotments.contracts} allotment(s)` },
              { label: 'Rooms assigned', value: hotels.data.allotments.bookedRooms, note: `${hotels.data.allotments.availableRooms} still free` },
            ]} />
          )}
        </Section>
        <Section title="Transport" icon={Bus} query={transport} empty={!!transport.data && transport.data.vehicles.total === 0 && transport.data.trips.total === 0}>
          {transport.data && (
            <Tiles items={[
              { label: 'Vehicles in service', value: transport.data.vehicles.active, note: `${transport.data.vehicles.byStatus.UNDER_MAINTENANCE ?? 0} under maintenance` },
              { label: 'Trips next 30 days', value: transport.data.trips.next30Days, note: `${transport.data.trips.byStatus.IN_PROGRESS ?? 0} under way now` },
              { label: 'Passengers carried', value: transport.data.trips.passengersCarried, note: `${transport.data.trips.byStatus.COMPLETED ?? 0} completed trips` },
              { label: 'Route seats sold', value: `${transport.data.seats.sold} / ${transport.data.seats.offered}`, note: `${transport.data.seats.utilizationRate}% of seats offered` },
            ]} />
          )}
        </Section>
      </div>

      {canFinance && (
        <Section title="Invoices (SAR)" icon={DollarSign} query={finance}>
          {finance.data && (
            <Tiles items={[
              { label: 'Collected', value: sar(finance.data.collectedCents), note: 'payments recorded on invoices' },
              { label: 'Paid invoices', value: sar(finance.data.paid.amountCents), note: `${finance.data.paid.count} invoice(s)` },
              { label: 'Still owed', value: sar(finance.data.outstanding.amountCents), note: `${finance.data.outstanding.count} open invoice(s)` },
              { label: 'Drafts', value: sar(finance.data.draft.amountCents), note: `${finance.data.draft.count} not yet issued` },
            ]} />
          )}
        </Section>
      )}
    </div>
  );
}
