import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BookOpen, DollarSign, FileCheck2, TrendingUp, Users } from 'lucide-react-native';
import { Card, KpiCard, Skeleton } from '@/components/UI';
import {
  useReportsBookings, useReportsFinance, useReportsOverview, useReportsPilgrims, useReportsVisa,
} from '@/hooks/use-api';
import { colors, fmtSAR, fontSize, radius, spacing } from '@/lib/theme';

export default function ReportsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const overview = useReportsOverview();
  const pilgrims = useReportsPilgrims();
  const bookings = useReportsBookings();
  const finance = useReportsFinance();
  const visa = useReportsVisa();

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([overview.refetch(), pilgrims.refetch(), bookings.refetch(), finance.refetch(), visa.refetch()]);
    setRefreshing(false);
  };

  const renderBars = (data: Record<string, number> | undefined, palette: string[]) => {
    if (!data) return null;
    const entries = Object.entries(data);
    const max = Math.max(...entries.map(([, v]) => Number(v)), 1);
    return (
      <View style={{ gap: 10 }}>
        {entries.map(([label, value], i) => (
          <View key={label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={s.barLabel}>{label.replace(/_/g, ' ')}</Text>
              <Text style={s.barValue}>{String(value)}</Text>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${(Number(value) / max) * 100}%`, backgroundColor: palette[i % palette.length] }]} />
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.gray50 }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* KPI grid */}
      <View style={s.kpiGrid}>
        {overview.isLoading ? (
          [0,1,2,3].map(i => <View key={i} style={s.kpiCell}><Skeleton h={120} style={{ borderRadius: radius.xl }} /></View>)
        ) : (
          <>
            <View style={s.kpiCell}><KpiCard label="Total Pilgrims" value={overview.data?.totalPilgrims ?? '—'} icon={<Users />} tint="blue" /></View>
            <View style={s.kpiCell}><KpiCard label="Confirmed" value={overview.data?.confirmedBookings ?? '—'} icon={<BookOpen />} tint="green" /></View>
            <View style={s.kpiCell}><KpiCard label="Revenue Paid" value={fmtSAR(overview.data?.revenuePaidCents)} icon={<DollarSign />} tint="brand" /></View>
            <View style={s.kpiCell}>
              <KpiCard
                label="Visa Approval"
                value={visa.data?.successRate != null ? `${Number(visa.data.successRate).toFixed(1)}%` : '—'}
                icon={<FileCheck2 />}
                tint="purple"
              />
            </View>
          </>
        )}
      </View>

      <Card>
        <View style={s.titleRow}>
          <Users color={colors.blue600} size={18} />
          <Text style={s.title}>Pilgrim status</Text>
        </View>
        {pilgrims.isLoading ? <Skeleton h={120} /> : renderBars(pilgrims.data?.byStatus, [colors.brand500, colors.green500, colors.blue500, colors.purple500, colors.yellow500, colors.red500])}
      </Card>

      <Card>
        <View style={s.titleRow}>
          <BookOpen color={colors.green600} size={18} />
          <Text style={s.title}>Bookings by status</Text>
        </View>
        {bookings.isLoading ? <Skeleton h={120} /> : renderBars(bookings.data?.byStatus, [colors.green500, colors.brand500, colors.purple500, colors.blue500, colors.yellow500, colors.red500])}
      </Card>

      <Card>
        <View style={s.titleRow}>
          <FileCheck2 color={colors.yellow600} size={18} />
          <Text style={s.title}>Visa pipeline</Text>
        </View>
        {visa.isLoading ? <Skeleton h={120} /> : renderBars(visa.data?.byStatus, [colors.yellow500, colors.green500, colors.brand500, colors.blue500, colors.red500, colors.purple500])}
      </Card>

      <Card>
        <View style={s.titleRow}>
          <DollarSign color={colors.brand600} size={18} />
          <Text style={s.title}>Revenue breakdown (SAR)</Text>
        </View>
        {finance.isLoading ? <Skeleton h={120} /> : (
          <View style={{ gap: spacing.sm }}>
            {[
              { label: 'Paid',        cents: finance.data?.paid?.amountCents,        color: colors.brand500 },
              { label: 'Outstanding', cents: finance.data?.outstanding?.amountCents, color: colors.yellow500 },
              { label: 'Draft',       cents: finance.data?.draft?.amountCents,       color: colors.gray400 },
            ].map((b) => (
              <View key={b.label} style={s.financeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.barLabel}>{b.label}</Text>
                </View>
                <Text style={[s.barValue, { color: b.color, fontWeight: '700' }]}>{fmtSAR(b.cents)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card>
        <View style={s.titleRow}>
          <TrendingUp color={colors.red600} size={18} />
          <Text style={s.title}>Monthly booking trend</Text>
        </View>
        {bookings.isLoading ? <Skeleton h={120} /> : (
          <View style={{ gap: spacing.xs }}>
            {(bookings.data?.monthlyTrend ?? []).slice(-6).map((t: any) => (
              <View key={t.month} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={[s.barLabel, { width: 70 }]}>{t.month}</Text>
                <View style={[s.barTrack, { flex: 1 }]}>
                  <View style={[s.barFill, { width: `${Math.min(100, (t.count ?? 0) * 25)}%`, backgroundColor: colors.brand500 }]} />
                </View>
                <Text style={s.barValue}>{t.count}</Text>
              </View>
            ))}
            {(!bookings.data?.monthlyTrend || bookings.data.monthlyTrend.length === 0) && (
              <Text style={{ color: colors.gray400, fontSize: fontSize.xs, textAlign: 'center', padding: spacing.md }}>No trend data</Text>
            )}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm / 2 },
  kpiCell: { width: '50%', paddingHorizontal: spacing.sm / 2, marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  title: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  barLabel: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '500' },
  barValue: { fontSize: fontSize.xs, color: colors.gray800, fontWeight: '600' },
  barTrack: { height: 8, backgroundColor: colors.gray100, borderRadius: 999, marginTop: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  financeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
});
