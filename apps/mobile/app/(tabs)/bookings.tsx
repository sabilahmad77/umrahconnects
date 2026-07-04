import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen } from 'lucide-react-native';
import { Card, EmptyState, ScreenTitle, Skeleton, StatusBadge } from '@/components/UI';
import { useBookings, useBookingStats } from '@/hooks/use-api';
import { colors, fmtSAR, fontSize, radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, any> = {
  PENDING: 'yellow', DRAFT: 'gray', QUOTED: 'blue',
  CONFIRMED: 'green', IN_PROGRESS: 'brand', COMPLETED: 'purple', CANCELLED: 'red',
};
const FILTERS = ['ALL', 'CONFIRMED', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];

export default function BookingsScreen() {
  const [filter, setFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const list = useBookings({ page: 1, limit: 50, status: filter !== 'ALL' ? filter : undefined });
  const stats = useBookingStats();
  const items: any[] = list.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray50 }} edges={['top']}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <ScreenTitle title="Bookings" subtitle={`${list.data?.total ?? 0} total bookings`} />
            {/* Filters */}
            <View style={s.filterRow}>
              {FILTERS.map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[s.filterChip, filter === f && s.filterChipActive]}
                >
                  <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f.replace(/_/g, ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={0.7}>
            <Card>
              <View style={s.bookingHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bookingRef} numberOfLines={1}>
                    {item.bookingRef ?? item.id?.slice(0, 8)}
                  </Text>
                  <Text style={s.bookingMeta} numberOfLines={1}>
                    {item.pilgrim
                      ? `${item.pilgrim.firstNameEn ?? ''} ${item.pilgrim.lastNameEn ?? ''}`.trim() || '—'
                      : item.clientName ?? '—'}
                  </Text>
                </View>
                <StatusBadge label={item.status?.replace(/_/g, ' ') ?? '—'} tone={STATUS_TONE[item.status] ?? 'gray'} />
              </View>
              <View style={s.bookingFoot}>
                <Text style={s.bookingAmount}>{fmtSAR(item.totalAmountCents ?? item.totalCents)}</Text>
                <Text style={s.bookingDate}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          list.isLoading ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {[0,1,2,3].map(i => <Skeleton key={i} h={90} style={{ borderRadius: radius.xl }} />)}
            </View>
          ) : (
            <EmptyState icon={<BookOpen color={colors.gray300} size={40} />} title="No bookings" subtitle="Create bookings from your web workspace." />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await Promise.allSettled([list.refetch(), stats.refetch()]);
            setRefreshing(false);
          }} />
        }
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.gray200,
    backgroundColor: colors.white,
  },
  filterChipActive: { backgroundColor: colors.brand500, borderColor: colors.brand500 },
  filterText: { fontSize: 11, color: colors.gray600, fontWeight: '600' },
  filterTextActive: { color: colors.white },
  bookingHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bookingRef: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  bookingMeta: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },
  bookingFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  bookingAmount: { fontSize: fontSize.base, fontWeight: '700', color: colors.brand600 },
  bookingDate: { fontSize: fontSize.xs, color: colors.gray400 },
});
