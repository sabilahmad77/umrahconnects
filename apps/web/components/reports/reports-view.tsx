'use client';

import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  useReportsOverview, useReportsPilgrims, useReportsBookings,
  useReportsFinance, useReportsVisa,
} from '@/hooks/use-api';
import { Users, BookOpen, DollarSign, FileCheck2, TrendingUp, Download } from 'lucide-react';

const COLORS = ['#d4831a', '#006c35', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

const fmtSAR = (cents?: number) =>
  cents != null ? `SAR ${(cents / 100).toLocaleString('en-SA', { maximumFractionDigits: 0 })}` : '—';

function SectionCard({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {loading ? (
        <div className="h-48 bg-gray-50 rounded-xl animate-pulse flex items-center justify-center text-gray-400 text-sm">
          Loading…
        </div>
      ) : children}
    </div>
  );
}

export function ReportsView() {
  const { data: overview, isLoading: ol } = useReportsOverview();
  const { data: pilgrims, isLoading: pl } = useReportsPilgrims();
  const { data: bookings, isLoading: bl } = useReportsBookings();
  const { data: finance, isLoading: fl } = useReportsFinance();
  const { data: visa, isLoading: vl } = useReportsVisa();

  // Derived data
  const pilgrimStatusData = pilgrims?.byStatus
    ? Object.entries(pilgrims.byStatus).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  const bookingTrend = bookings?.monthlyTrend?.map((t: any) => ({
    month: t.month?.slice(0, 3) ?? '',
    count: t.count ?? 0,
  })) ?? [];

  const bookingStatusData = bookings?.byStatus
    ? Object.entries(bookings.byStatus).map(([name, value]) => ({ name, value }))
    : [];

  const visaStatusData = visa?.byStatus
    ? Object.entries(visa.byStatus).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  const financeData = finance
    ? [
        { name: 'Paid', value: (finance.paid?.amountCents ?? 0) / 100 },
        { name: 'Outstanding', value: (finance.outstanding?.amountCents ?? 0) / 100 },
        { name: 'Draft', value: (finance.draft?.amountCents ?? 0) / 100 },
      ]
    : [];

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Platform-wide insights and trends</p>
        </div>
        <button
          onClick={() => {
            // Build a CSV from every loaded report dataset and download it
            const rows: string[][] = [['Section', 'Metric', 'Value']];
            const pushObj = (section: string, obj: any, prefix = '') => {
              if (!obj || typeof obj !== 'object') return;
              for (const [k, v] of Object.entries(obj)) {
                if (v != null && typeof v === 'object' && !Array.isArray(v)) pushObj(section, v, `${prefix}${k}.`);
                else if (!Array.isArray(v)) rows.push([section, `${prefix}${k}`, String(v ?? '')]);
              }
            };
            pushObj('Overview', overview);
            pushObj('Pilgrims', pilgrims);
            pushObj('Bookings', bookings);
            pushObj('Finance', finance);
            pushObj('Visa', visa);
            const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `umrah-connect-report-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          className="flex items-center gap-2 text-sm px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* KPI summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pilgrims',     value: overview?.totalPilgrims?.toLocaleString() ?? '—', icon: Users,       color: 'bg-blue-50 text-blue-600',   trend: '+12%' },
          { label: 'Confirmed Bookings', value: overview?.confirmedBookings?.toLocaleString() ?? '—', icon: BookOpen, color: 'bg-green-50 text-green-600', trend: '+8%' },
          { label: 'Revenue Paid',       value: fmtSAR(overview?.revenuePaidCents),           icon: DollarSign,  color: 'bg-brand-50 text-brand-600',  trend: '+18%' },
          { label: 'Visa Approval Rate', value: visa?.successRate != null ? `${visa.successRate.toFixed(1)}%` : '—', icon: FileCheck2, color: 'bg-purple-50 text-purple-600', trend: '' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${k.color}`}>
              <k.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{k.value}</p>
            <p className="text-xs text-gray-500 mt-1">{k.label}</p>
            {k.trend && (
              <p className="flex items-center gap-1 text-xs text-green-600 font-medium mt-1.5">
                <TrendingUp className="h-3 w-3" /> {k.trend} vs last period
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Booking Trend — full width */}
      <SectionCard title="📈 Monthly Booking Trend" loading={bl}>
        {bookingTrend.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No trend data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={bookingTrend} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="bkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4831a" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#d4831a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                formatter={(v: any) => [v, 'Bookings']}
              />
              <Area type="monotone" dataKey="count" stroke="#d4831a" strokeWidth={2.5} fill="url(#bkGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Two charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pilgrim status breakdown */}
        <SectionCard title="👥 Pilgrim Status Breakdown" loading={pl}>
          {pilgrimStatusData.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No pilgrim data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pilgrimStatusData} layout="vertical" margin={{ left: 4, right: 4 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {pilgrimStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        {/* Visa pipeline pie */}
        <SectionCard title="📋 Visa Pipeline Distribution" loading={vl}>
          {visaStatusData.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">No visa data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={visaStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="40%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={45}
                >
                  {visaStatusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(val) => val}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                  formatter={(v: any) => [v, 'Applications']}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* Finance breakdown */}
      <SectionCard title="💰 Revenue Breakdown (SAR)" loading={fl}>
        {financeData.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No finance data</p>
        ) : (
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <ResponsiveContainer width={200} height={180}>
              <PieChart>
                <Pie data={financeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                  {financeData.map((_, i) => (
                    <Cell key={i} fill={['#d4831a', '#f59e0b', '#9ca3af'][i]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-3">
              {financeData.map((d, i) => {
                const colors = ['text-brand-600 bg-brand-50', 'text-yellow-600 bg-yellow-50', 'text-gray-500 bg-gray-100'];
                const total = financeData.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${colors[i]}`}>{d.name}</span>
                      <span className="text-sm font-bold text-gray-800">
                        SAR {d.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${['bg-brand-500', 'bg-yellow-400', 'bg-gray-300'][i]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{pct}% of total billed</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Gender split */}
      {pilgrims?.byGender && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">🧕 Pilgrim Gender Distribution</h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Male Pilgrims',   value: pilgrims.byGender.MALE,   color: 'from-blue-400 to-blue-500' },
              { label: 'Female Pilgrims', value: pilgrims.byGender.FEMALE, color: 'from-pink-400 to-pink-500' },
            ].map((g) => {
              const total2 = (pilgrims.byGender.MALE ?? 0) + (pilgrims.byGender.FEMALE ?? 0);
              const pct = total2 > 0 ? Math.round((g.value / total2) * 100) : 0;
              return (
                <div key={g.label} className={`bg-gradient-to-br ${g.color} rounded-xl p-4 text-white`}>
                  <p className="text-3xl font-bold">{g.value?.toLocaleString() ?? 0}</p>
                  <p className="text-sm opacity-80 mt-1">{g.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{pct}% of total</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
