import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, CalendarCheck } from 'lucide-react-native';
import { PrimaryButton, GhostButton } from '@/components/brand';
import { colors, font, fontSize, radius, spacing } from '@/lib/theme';

export default function BookingSuccess() {
  const router = useRouter();
  const p = useLocalSearchParams<{ title?: string; total?: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brand500 }} edges={['top', 'bottom']}>
      <View style={s.wrap}>
        <View style={s.badge}>
          <View style={s.badgeInner}><Check color={colors.white} size={48} strokeWidth={3} /></View>
        </View>
        <Text style={s.title}>Booking Confirmed</Text>
        <Text style={s.sub}>
          Your booking for {p.title ?? 'the selected service'} has been confirmed.
          A confirmation has been added to your notifications.
        </Text>

        <View style={s.card}>
          <View style={s.cardRow}>
            <CalendarCheck color={colors.gold500} size={20} />
            <Text style={s.cardLabel}>Total paid</Text>
            <Text style={s.cardValue}>{p.total ?? '—'}</Text>
          </View>
        </View>
      </View>

      <View style={s.actions}>
        <PrimaryButton title="View my bookings" onPress={() => router.replace('/bookings' as any)} style={{ backgroundColor: colors.gold500 }} />
        <GhostButton title="Back to marketplace" onPress={() => router.replace('/(tabs)/market' as any)} style={{ backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.4)' }} />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  badge: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  badgeInner: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize['2xl'], fontFamily: font.heading, color: colors.white },
  sub: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.8)', fontFamily: font.body, textAlign: 'center', lineHeight: 21, paddingHorizontal: spacing.md },
  card: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.xl, padding: spacing.lg, width: '100%', marginTop: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardLabel: { flex: 1, color: 'rgba(255,255,255,0.85)', fontFamily: font.bodyMedium, fontSize: fontSize.sm },
  cardValue: { color: colors.white, fontFamily: font.heading, fontSize: fontSize.lg },
  actions: { padding: spacing.lg, gap: spacing.sm },
});
