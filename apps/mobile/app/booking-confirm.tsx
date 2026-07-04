import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Bed, Bus, CalendarDays, CreditCard, FileCheck2, Package, Users,
} from 'lucide-react-native';
import { GreenHeader, MediaPanel, PriceRow, PrimaryButton, CATEGORY_PHOTO } from '@/components/brand';
import { useCreateBooking } from '@/hooks/use-api';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

const ICON = (cat: string, color: string, size = 34) =>
  cat === 'transport' ? <Bus color={color} size={size} /> :
  cat === 'visa' ? <FileCheck2 color={color} size={size} /> :
  cat === 'packages' ? <Package color={color} size={size} /> :
  <Bed color={color} size={size} />;

function parseSar(p?: string): number {
  const n = Number(String(p ?? '').replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

export default function BookingConfirm() {
  const router = useRouter();
  const p = useLocalSearchParams<{ title?: string; sub?: string; price?: string; unit?: string; cat?: string; tone?: any }>();
  const createM = useCreateBooking();
  const [submitting, setSubmitting] = useState(false);

  const base = parseSar(p.price);
  const taxes = Math.round(base * 0.15);
  const total = base + taxes;
  const fmt = (n: number) => `SAR ${n.toLocaleString()}`;

  const confirm = async () => {
    setSubmitting(true);
    // Best-effort booking record (frontend-first; safe if backend rejects synthetic listing)
    try {
      await createM.mutateAsync({ totalAmountCents: total * 100, currency: 'SAR', status: 'DRAFT', notes: p.title });
    } catch { /* backend booking integration pending — proceed to success UI */ }
    setSubmitting(false);
    router.replace({ pathname: '/booking-success', params: { title: p.title, total: fmt(total) } } as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader title="Review & Confirm" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] }}>

        {/* Service / hotel card */}
        <View style={s.card}>
          <MediaPanel
            tone={(p.tone as any) || 'green'} height={150}
            image={CATEGORY_PHOTO[p.cat ?? 'hotels']}
            style={{ borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl }}
          />
          <View style={{ padding: spacing.lg, gap: 8 }}>
            <Text style={s.title}>{p.title ?? 'Service'}</Text>
            <Text style={s.sub}>{p.sub ?? ''}</Text>
            <View style={s.metaRow}>
              <View style={s.metaItem}>
                <CalendarDays color={colors.gray400} size={14} />
                <Text style={s.metaText}>May 25 – May 30, 2026</Text>
              </View>
              <View style={s.metaItem}>
                <Users color={colors.gray400} size={14} />
                <Text style={s.metaText}>2 Adults, 1 Child</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Price breakdown */}
        <View style={s.block}>
          <Text style={s.blockTitle}>Price summary</Text>
          <PriceRow label={`Base price ${p.unit ?? ''}`} value={fmt(base)} />
          <PriceRow label="Taxes & fees (15%)" value={fmt(taxes)} />
          <View style={s.divider} />
          <PriceRow label="Total" value={fmt(total)} bold />
        </View>

        {/* Payment method */}
        <View style={s.block}>
          <Text style={s.blockTitle}>Payment method</Text>
          <View style={s.payRow}>
            <View style={s.payIcon}><CreditCard color={colors.brand500} size={20} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.payName}>Visa •••• 4242</Text>
              <Text style={s.paySub}>Expires 08/28</Text>
            </View>
            <Text style={s.payChange}>Change</Text>
          </View>
        </View>

        <Text style={s.note}>
          By confirming you agree to Umrah Connect's terms. Payment processing connects to the
          finance backend when enabled.
        </Text>

        <PrimaryButton title={`Confirm Booking · ${fmt(total)}`} loading={submitting} onPress={confirm} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  title: { fontSize: fontSize.lg, fontFamily: font.heading, color: colors.gray900 },
  sub: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.body },
  metaRow: { flexDirection: 'row', gap: spacing.lg, marginTop: 6, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, color: colors.gray600, fontFamily: font.bodyMedium },

  block: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  blockTitle: { fontSize: fontSize.sm, fontFamily: font.headingSemi, color: colors.gray900, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.gray100, marginVertical: 6 },

  payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  payIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  payName: { fontSize: fontSize.sm, fontFamily: font.bodySemi, color: colors.gray900 },
  paySub: { fontSize: 11, color: colors.gray500, fontFamily: font.body },
  payChange: { fontSize: 12, color: colors.gold600, fontFamily: font.bodySemi },

  note: { fontSize: 11, color: colors.gray400, fontFamily: font.body, lineHeight: 16, textAlign: 'center', paddingHorizontal: spacing.md },
});
