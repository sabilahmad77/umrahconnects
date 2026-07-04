import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

// Curated premium category photography (same set as the web marketplace) —
// gives the photo-rich look from the reference; falls back to a branded panel.
export const CATEGORY_PHOTO: Record<string, string> = {
  hotels:    'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format&fit=crop',
  hotel:     'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80&auto=format&fit=crop',
  transport: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800&q=80&auto=format&fit=crop',
  visa:      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop',
  catering:  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format&fit=crop',
  guide:     'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&q=80&auto=format&fit=crop',
  packages:  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&auto=format&fit=crop',
  package:   'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80&auto=format&fit=crop',
  makkah:    'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=800&q=80&auto=format&fit=crop',
};

// ── Deep-green screen header (matches reference top bars) ─────────────────────
export function GreenHeader({
  title, onBack, right, subtitle,
}: { title: string; onBack?: () => void; right?: ReactNode; subtitle?: string }) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brand500 }}>
      <View style={gh.row}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={gh.iconBtn}>
            <ChevronLeft color={colors.white} size={24} />
          </Pressable>
        ) : <View style={gh.iconBtn} />}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={gh.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={gh.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={gh.iconBtn}>{right}</View>
      </View>
    </SafeAreaView>
  );
}
const gh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: spacing.md, paddingTop: spacing.xs, minHeight: 52 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.white, fontFamily: font.heading, fontSize: fontSize.lg },
  sub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 1 },
});

// ── Segmented underline tabs (For You / Following / Groups) ───────────────────
export function SegmentedTabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={st.bar}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable key={t.key} style={st.tab} onPress={() => onChange(t.key)}>
            <Text style={[st.label, active && st.labelActive]}>{t.label}</Text>
            <View style={[st.underline, active && st.underlineActive]} />
          </Pressable>
        );
      })}
    </View>
  );
}
const st = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  tab: { flex: 1, alignItems: 'center', paddingTop: spacing.md, gap: spacing.sm },
  label: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.bodyMedium },
  labelActive: { color: colors.brand500, fontFamily: font.bodySemi },
  underline: { height: 3, width: '60%', backgroundColor: 'transparent', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  underlineActive: { backgroundColor: colors.gold500 },
});

// ── Pill chips tab (All / Bookings / Payments / Offers) ──────────────────────
export function ChipTabs<T extends string>({
  tabs, value, onChange,
}: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={ct.row}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={[ct.chip, active && ct.chipActive]}>
            <Text style={[ct.label, active && ct.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const ct = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.white },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.gray100 },
  chipActive: { backgroundColor: colors.brand500 },
  label: { fontSize: 12, color: colors.gray600, fontFamily: font.bodyMedium },
  labelActive: { color: colors.white, fontFamily: font.bodySemi },
});

// ── Branded media panel (reliable, premium — no broken remote images) ────────
const MEDIA_TINTS: Record<string, { bg: string; fg: string; deco: string }> = {
  green:    { bg: '#0F3D37', fg: '#E7EFEC', deco: 'rgba(200,169,107,0.18)' },
  emerald:  { bg: '#2A7A6B', fg: '#EAF5F1', deco: 'rgba(255,255,255,0.14)' },
  gold:     { bg: '#C8A96B', fg: '#3A2E17', deco: 'rgba(255,255,255,0.22)' },
  sand:     { bg: '#E8DFD1', fg: '#0F3D37', deco: 'rgba(15,61,55,0.10)' },
  navy:     { bg: '#112234', fg: '#E7EFEC', deco: 'rgba(200,169,107,0.16)' },
};
export function MediaPanel({
  tone = 'green', icon, label, height = 150, style, image,
}: { tone?: keyof typeof MEDIA_TINTS; icon?: ReactNode; label?: string; height?: number; style?: ViewStyle; image?: string }) {
  const t = MEDIA_TINTS[tone];
  const [errored, setErrored] = useState(false);

  // Real photo (reference look) when available; branded panel as a safe fallback.
  if (image && !errored) {
    return (
      <View style={[{ height, overflow: 'hidden', backgroundColor: t.bg }, style]}>
        <Image source={{ uri: image }} onError={() => setErrored(true)} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
        {/* subtle scrim for legibility of any overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,61,55,0.10)' }]} />
        {icon ? <View style={[mp.overlayIcon]}>{icon}</View> : null}
      </View>
    );
  }
  return (
    <View style={[{ height, backgroundColor: t.bg, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }, style]}>
      <View style={[mp.deco, { backgroundColor: t.deco, top: -30, right: -20, width: 120, height: 120 }]} />
      <View style={[mp.deco, { backgroundColor: t.deco, bottom: -40, left: -10, width: 90, height: 90 }]} />
      {icon ? <View style={{ opacity: 0.95 }}>{icon}</View> : null}
      {label ? <Text style={{ color: t.fg, fontFamily: font.headingSemi, fontSize: fontSize.base, marginTop: 8 }}>{label}</Text> : null}
    </View>
  );
}
const mp = StyleSheet.create({
  deco: { position: 'absolute', borderRadius: 999 },
  overlayIcon: { position: 'absolute', top: 10, left: 10, opacity: 0.9 },
});

// ── Category tile (Hotels / Transport / Visa / Packages) ─────────────────────
export function CategoryTile({
  icon, label, tone = 'green', onPress, active,
}: { icon: ReactNode; label: string; tone?: 'green' | 'gold' | 'emerald' | 'navy'; onPress?: () => void; active?: boolean }) {
  const bg = { green: colors.brand50, gold: colors.gold50, emerald: '#E6F1EE', navy: '#E7EAEF' }[tone];
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <View style={[cti.box, { backgroundColor: bg }, active && { borderWidth: 2, borderColor: colors.gold500 }]}>
        {icon}
      </View>
      <Text style={cti.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
const cti = StyleSheet.create({
  box: { width: 60, height: 60, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, color: colors.gray700, fontFamily: font.bodyMedium },
});

// ── Primary / secondary buttons (deep green pill) ────────────────────────────
export function PrimaryButton({
  title, onPress, loading, disabled, left, style,
}: { title: string; onPress?: () => void; loading?: boolean; disabled?: boolean; left?: ReactNode; style?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [pb.btn, pressed && { opacity: 0.9 }, (disabled || loading) && { opacity: 0.6 }, style]}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : (
        <>{left}<Text style={pb.text}>{title}</Text></>
      )}
    </Pressable>
  );
}
export function GhostButton({ title, onPress, left, style }: { title: string; onPress?: () => void; left?: ReactNode; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pb.ghost, pressed && { opacity: 0.85 }, style]}>
      {left}<Text style={pb.ghostText}>{title}</Text>
    </Pressable>
  );
}
const pb = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand500, paddingVertical: 15, borderRadius: radius.lg, ...shadow.card },
  text: { color: colors.white, fontFamily: font.bodySemi, fontSize: fontSize.base },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200 },
  ghostText: { color: colors.gray800, fontFamily: font.bodySemi, fontSize: fontSize.base },
});

// ── Price row (booking breakdown) ────────────────────────────────────────────
export function PriceRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={prw.row}>
      <Text style={[prw.label, bold && prw.boldLabel]}>{label}</Text>
      <Text style={[prw.value, bold && prw.boldValue]}>{value}</Text>
    </View>
  );
}
const prw = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  label: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.body },
  value: { fontSize: fontSize.sm, color: colors.gray800, fontFamily: font.bodyMedium },
  boldLabel: { color: colors.gray900, fontFamily: font.headingSemi, fontSize: fontSize.base },
  boldValue: { color: colors.brand500, fontFamily: font.heading, fontSize: fontSize.lg },
});

// ── Section header (title + "View all") ──────────────────────────────────────
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={sh.row}>
      <Text style={sh.title}>{title}</Text>
      {action ? <Pressable onPress={onAction}><Text style={sh.action}>{action}</Text></Pressable> : null}
    </View>
  );
}
const sh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: fontSize.lg, fontFamily: font.heading, color: colors.gray900 },
  action: { fontSize: fontSize.sm, color: colors.gold600, fontFamily: font.bodySemi },
});
