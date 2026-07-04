import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BookOpen, Building2, Bus, DollarSign, FileCheck2, Newspaper,
  ShoppingBag, TrendingUp, Users, UsersRound,
} from 'lucide-react-native';
import { Card, KpiCard, ScreenTitle, SectionTitle, Skeleton } from '@/components/UI';
import {
  useBookings, useFinanceStats, useHotelStats, usePilgrimStats,
  useReportsOverview, useTransportStats, useVisaStats,
} from '@/hooks/use-api';
import { useAuthStore } from '@/lib/auth-store';
import { colors, fmtSAR, fontSize, radius, spacing } from '@/lib/theme';

type DType = 'operator' | 'hotel' | 'transport' | 'compliance' | 'finance' | 'admin' | 'pilgrim';

const ALL_LINKS = {
  hotels:      { href: '/hotels',     label: 'Hotels',      Icon: Building2,  tint: 'blue'   as const },
  transport:   { href: '/transport',  label: 'Transport',   Icon: Bus,        tint: 'purple' as const },
  groups:      { href: '/groups',     label: 'Groups',      Icon: UsersRound, tint: 'green'  as const },
  compliance:  { href: '/compliance', label: 'Visa',        Icon: FileCheck2, tint: 'yellow' as const },
  marketplace: { href: '/(tabs)/market',label: 'Marketplace', Icon: ShoppingBag,tint: 'brand'  as const },
  reports:     { href: '/reports',    label: 'Reports',     Icon: TrendingUp, tint: 'red'    as const },
  social:      { href: '/social',     label: 'Social',      Icon: Newspaper,  tint: 'blue'   as const },
};

const ROLE_QUICK_LINKS: Record<DType, (keyof typeof ALL_LINKS)[]> = {
  operator:   ['hotels', 'transport', 'groups', 'compliance', 'marketplace', 'reports', 'social'],
  hotel:      ['hotels', 'marketplace', 'social', 'reports'],
  transport:  ['transport', 'marketplace', 'social', 'reports'],
  compliance: ['compliance', 'marketplace', 'social', 'reports'],
  finance:    ['reports', 'marketplace', 'social'],
  admin:      ['hotels', 'transport', 'groups', 'compliance', 'marketplace', 'reports', 'social'],
  pilgrim:    ['marketplace', 'social', 'groups'],
};

// Lazy import — only loaded when needed
import SocialScreen from '../social';

export default function HomeTab() {
  const user = useAuthStore((s) => s.user);

  // Pilgrim/traveler home is the Social Hub — not an operator KPI grid.
  if (user?.dashboardType === 'pilgrim') {
    return <SocialScreen />;
  }
  return <Dashboard />;
}

function Dashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const overview = useReportsOverview();
  const pilgrimStats = usePilgrimStats();
  const bookingStats = useBookings({ page: 1, limit: 5 });
  const financeStats = useFinanceStats();
  const hotelStats = useHotelStats();
  const transportStats = useTransportStats();
  const visaStats = useVisaStats();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.allSettled([
      overview.refetch(), pilgrimStats.refetch(), bookingStats.refetch(),
      financeStats.refetch(), hotelStats.refetch(), transportStats.refetch(), visaStats.refetch(),
    ]);
    setRefreshing(false);
  };

  const loading = overview.isLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray50 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand500} />}
      >
        {/* Greeting */}
        <View style={s.greetRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(user?.email?.[0] ?? 'A').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.greetSmall}>Welcome back</Text>
            <Text style={s.greetName} numberOfLines={1}>{user?.tenantName ?? 'Operator workspace'}</Text>
          </View>
        </View>

        <ScreenTitle title="Dashboard" subtitle="Today's operations at a glance" />

        {/* KPIs */}
        <View style={s.kpiGrid}>
          {loading ? (
            [0,1,2,3].map(i => (
              <View key={i} style={s.kpiCell}>
                <Skeleton h={120} style={{ borderRadius: radius.xl }} />
              </View>
            ))
          ) : (
            <>
              <View style={s.kpiCell}>
                <KpiCard
                  label="Total Pilgrims"
                  value={overview.data?.totalPilgrims?.toLocaleString() ?? '—'}
                  icon={<Users />}
                  tint="blue"
                  trend="+12% vs last period"
                />
              </View>
              <View style={s.kpiCell}>
                <KpiCard
                  label="Confirmed Bookings"
                  value={overview.data?.confirmedBookings?.toLocaleString() ?? '—'}
                  icon={<BookOpen />}
                  tint="green"
                  trend="+8% vs last period"
                />
              </View>
              <View style={s.kpiCell}>
                <KpiCard
                  label="Revenue Paid"
                  value={fmtSAR(overview.data?.revenuePaidCents)}
                  icon={<DollarSign />}
                  tint="brand"
                  trend="+18% vs last period"
                />
              </View>
              <View style={s.kpiCell}>
                <KpiCard
                  label="Visa Approval"
                  value={visaStats.data?.successRate != null ? `${Number(visaStats.data.successRate).toFixed(1)}%` : '—'}
                  icon={<FileCheck2 />}
                  tint="purple"
                />
              </View>
            </>
          )}
        </View>

        {/* Quick links - role-specific */}
        <SectionTitle>Quick access</SectionTitle>
        <Card style={{ padding: spacing.md }}>
          <View style={s.linkGrid}>
            {(ROLE_QUICK_LINKS[(user?.dashboardType ?? 'operator') as DType] ?? ROLE_QUICK_LINKS.operator)
              .map(k => ALL_LINKS[k])
              .map(({ href, label, Icon, tint }) => {
              const tintBg = {
                brand: colors.brand50, green: colors.green50, blue: colors.blue50,
                purple: colors.purple50, yellow: colors.yellow50, red: colors.red50,
              }[tint];
              const tintFg = {
                brand: colors.brand600, green: colors.green600, blue: colors.blue600,
                purple: colors.purple600, yellow: colors.yellow600, red: colors.red600,
              }[tint];
              return (
                <TouchableOpacity key={href} style={s.linkTile} onPress={() => router.push(href as any)} activeOpacity={0.7}>
                  <View style={[s.linkIcon, { backgroundColor: tintBg }]}>
                    <Icon color={tintFg} size={20} />
                  </View>
                  <Text style={s.linkLabel}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Quick stats */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Supply chain</SectionTitle>
        <View style={{ gap: spacing.md }}>
          <Card style={s.statRow}>
            <View style={s.statLeft}>
              <View style={[s.statIcon, { backgroundColor: colors.blue50 }]}>
                <Building2 color={colors.blue600} size={20} />
              </View>
              <View>
                <Text style={s.statLabel}>Hotels</Text>
                <Text style={s.statValue}>{hotelStats.data?.total ?? hotelStats.data?.count ?? '—'} properties</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/hotels' as any)}>
              <Text style={s.viewLink}>View →</Text>
            </TouchableOpacity>
          </Card>

          <Card style={s.statRow}>
            <View style={s.statLeft}>
              <View style={[s.statIcon, { backgroundColor: colors.purple50 }]}>
                <Bus color={colors.purple600} size={20} />
              </View>
              <View>
                <Text style={s.statLabel}>Transport</Text>
                <Text style={s.statValue}>
                  {transportStats.data?.vehicleCount ?? '—'} vehicles · {transportStats.data?.driverCount ?? '—'} drivers
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/transport' as any)}>
              <Text style={s.viewLink}>View →</Text>
            </TouchableOpacity>
          </Card>

          <Card style={s.statRow}>
            <View style={s.statLeft}>
              <View style={[s.statIcon, { backgroundColor: colors.brand50 }]}>
                <DollarSign color={colors.brand600} size={20} />
              </View>
              <View>
                <Text style={s.statLabel}>Outstanding</Text>
                <Text style={s.statValue}>{fmtSAR(financeStats.data?.outstanding?.amountCents)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/finance' as any)}>
              <Text style={s.viewLink}>View →</Text>
            </TouchableOpacity>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  greetSmall: { fontSize: fontSize.xs, color: colors.gray500 },
  greetName: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray800 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm / 2, marginBottom: spacing.md },
  kpiCell: { width: '50%', paddingHorizontal: spacing.sm / 2, marginBottom: spacing.md },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  linkTile: { width: '25%', alignItems: 'center', paddingVertical: spacing.md, gap: 6 },
  linkIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { fontSize: 11, color: colors.gray700, fontWeight: '500' },
  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statIcon: { width: 38, height: 38, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: fontSize.xs, color: colors.gray500 },
  statValue: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray800, marginTop: 2 },
  viewLink: { color: colors.brand600, fontSize: fontSize.sm, fontWeight: '600' },
});
