import React, { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextProps, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import { colors, font, fontSize, radius, spacing } from '@/lib/theme';

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  icon,
  tint = 'brand',
  trend,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tint?: 'brand' | 'green' | 'blue' | 'purple' | 'yellow' | 'red';
  trend?: string;
}) {
  const tintBg = {
    brand: colors.brand50, green: colors.green50, blue: colors.blue50,
    purple: colors.purple50, yellow: colors.yellow50, red: colors.red50,
  }[tint];
  const tintFg = {
    brand: colors.brand600, green: colors.green600, blue: colors.blue600,
    purple: colors.purple600, yellow: colors.yellow600, red: colors.red600,
  }[tint];
  return (
    <Card style={s.kpiCard}>
      {icon && (
        <View style={[s.kpiIcon, { backgroundColor: tintBg }]}>
          <View>{React.isValidElement(icon) ? React.cloneElement(icon as any, { color: tintFg, size: 20 }) : icon}</View>
        </View>
      )}
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {trend ? <Text style={s.kpiTrend}>{trend}</Text> : null}
    </Card>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | `${number}%`; style?: ViewStyle }) {
  return <View style={[{ height: h, width: w as any, backgroundColor: colors.gray100, borderRadius: radius.md }, style]} />;
}

// ─── Badge / Status pill ─────────────────────────────────────────────────────
export function StatusBadge({
  label,
  tone = 'gray',
}: {
  label: string;
  tone?: 'gray' | 'brand' | 'green' | 'blue' | 'yellow' | 'red' | 'purple';
}) {
  const map = {
    gray:   { bg: colors.gray100,   fg: colors.gray600,    dot: colors.gray400 },
    brand:  { bg: colors.brand50,   fg: colors.brand600,   dot: colors.brand500 },
    green:  { bg: colors.green50,   fg: colors.green700,   dot: colors.green500 },
    blue:   { bg: colors.blue50,    fg: colors.blue700,    dot: colors.blue500 },
    yellow: { bg: colors.yellow50,  fg: colors.yellow600,  dot: colors.yellow500 },
    red:    { bg: colors.red50,     fg: colors.red600,     dot: colors.red500 },
    purple: { bg: colors.purple50,  fg: colors.purple600,  dot: colors.purple500 },
  }[tone];
  return (
    <View style={[s.badge, { backgroundColor: map.bg }]}>
      <View style={[s.badgeDot, { backgroundColor: map.dot }]} />
      <Text style={[s.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  left,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  left?: ReactNode;
}) {
  const bg = variant === 'primary' ? colors.brand500 : variant === 'secondary' ? colors.white : 'transparent';
  const fg = variant === 'primary' ? colors.white : colors.gray800;
  const borderColor = variant === 'secondary' ? colors.gray200 : 'transparent';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        s.btn,
        { backgroundColor: bg, borderColor, borderWidth: variant === 'secondary' ? 1 : 0, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {left}
          <Text style={[s.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

// ─── ScreenTitle / SectionTitle ──────────────────────────────────────────────
export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={s.screenTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.screenTitle}>{title}</Text>
        {subtitle && <Text style={s.screenSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[s.sectionTitle, style]}>{children}</Text>;
}

// ─── Empty state ─────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <View style={s.empty}>
      {icon}
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle && <Text style={s.emptySub}>{subtitle}</Text>}
    </View>
  );
}

// ─── Mono text ───────────────────────────────────────────────────────────────
export function Mono(props: TextProps) {
  return <Text {...props} style={[{ fontFamily: 'Menlo' }, props.style]} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.gray100,
    padding: spacing.lg,
  },
  kpiCard: {
    padding: spacing.lg,
    minWidth: 0,
  },
  kpiIcon: {
    width: 36, height: 36,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  kpiValue: {
    fontSize: fontSize['2xl'],
    fontFamily: font.heading,
    color: colors.gray900,
  },
  kpiLabel: {
    fontSize: fontSize.xs,
    fontFamily: font.body,
    color: colors.gray500,
    marginTop: 2,
  },
  kpiTrend: {
    fontSize: 11,
    color: colors.green600,
    fontFamily: font.bodySemi,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 6, height: 6, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: font.bodySemi },
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.xl,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
  },
  btnText: { fontSize: fontSize.base, fontFamily: font.bodySemi },
  screenTitleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  screenTitle: { fontSize: fontSize['2xl'], fontFamily: font.heading, color: colors.gray900 },
  screenSubtitle: { fontSize: fontSize.sm, fontFamily: font.body, color: colors.gray500, marginTop: 2 },
  sectionTitle: { fontSize: fontSize.base, fontFamily: font.headingSemi, color: colors.gray800, marginBottom: spacing.md },
  empty: { alignItems: 'center', padding: spacing['3xl'] },
  emptyTitle: { fontSize: fontSize.base, fontFamily: font.headingSemi, color: colors.gray700, marginTop: spacing.md },
  emptySub: { fontSize: fontSize.sm, fontFamily: font.body, color: colors.gray400, marginTop: 4, textAlign: 'center' },
});
