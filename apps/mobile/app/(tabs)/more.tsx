import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BookOpen, Bus, Building2, ChevronRight, DollarSign, FileCheck2, HelpCircle,
  LogOut, MapPin, Newspaper, Settings as SettingsIcon, Shield, ShoppingBag, Star,
  TrendingUp, Users, UsersRound, Wallet,
} from 'lucide-react-native';
import { DashboardType } from '@/lib/auth';
import { useSignOut } from '@/hooks/use-api';
import { useAuthStore } from '@/lib/auth-store';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

type Row = { label: string; Icon: any; tint: string; onPress?: () => void };

const ROLE_LABEL: Record<DashboardType, string> = {
  operator: 'Operator / Agency', hotel: 'Hotel Owner', transport: 'Transport Company',
  compliance: 'Visa Agency', finance: 'Finance Manager', admin: 'Super Admin', pilgrim: 'Traveler',
};

// Role-specific business modules (shown below the standard profile rows)
const ROLE_MODULES: Record<DashboardType, Row[]> = {
  operator:   [m('Pilgrims & CRM', Users, '/(tabs)/pilgrims'), m('Bookings', BookOpen, '/bookings'), m('Trip Groups', UsersRound, '/groups'), m('Hotels', Building2, '/hotels'), m('Transport', Bus, '/transport'), m('Visa & Compliance', FileCheck2, '/compliance'), m('Finance', DollarSign, '/(tabs)/finance'), m('Reports', TrendingUp, '/reports')],
  hotel:      [m('Hotel Inventory', Building2, '/hotels'), m('Bookings', BookOpen, '/bookings'), m('Finance', DollarSign, '/(tabs)/finance'), m('Reports', TrendingUp, '/reports')],
  transport:  [m('Fleet & Routes', Bus, '/transport'), m('Assignments', BookOpen, '/bookings'), m('Reports', TrendingUp, '/reports')],
  compliance: [m('Visa Pipeline', FileCheck2, '/compliance'), m('Pilgrims', Users, '/(tabs)/pilgrims'), m('Reports', TrendingUp, '/reports')],
  finance:    [m('Invoices', DollarSign, '/(tabs)/finance'), m('Reports', TrendingUp, '/reports')],
  admin:      [m('Pilgrims & CRM', Users, '/(tabs)/pilgrims'), m('Bookings', BookOpen, '/bookings'), m('Hotels', Building2, '/hotels'), m('Transport', Bus, '/transport'), m('Visa & Compliance', FileCheck2, '/compliance'), m('Finance', DollarSign, '/(tabs)/finance'), m('Reports', TrendingUp, '/reports')],
  pilgrim:    [m('Social Hub', Newspaper, '/social'), m('Discover Packages', ShoppingBag, '/(tabs)/market')],
};
function m(label: string, Icon: any, href: string): Row { return { label, Icon, tint: colors.brand500, _href: href } as any; }

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setActiveDashboard = useAuthStore((s) => s.setActiveDashboard);
  const signOut = useSignOut();
  if (!user) return null;

  const role = user.dashboardType;
  const modules = ROLE_MODULES[role] ?? ROLE_MODULES.operator;

  // Standard profile rows (reference: My Bookings / Wallet / Documents / Reviews / Settings / Help)
  const STANDARD: Row[] = [
    { label: 'Messages',     Icon: Newspaper,    tint: colors.blue600,  onPress: () => router.push('/messages' as any) },
    { label: 'My Bookings',  Icon: BookOpen,     tint: colors.brand500, onPress: () => router.push('/bookings' as any) },
    { label: 'My Wallet',    Icon: Wallet,       tint: colors.gold600,  onPress: () => router.push('/(tabs)/finance' as any) },
    { label: 'My Documents', Icon: FileCheck2,   tint: colors.emerald,  onPress: () => router.push('/compliance' as any) },
    { label: 'My Reviews',   Icon: Star,         tint: colors.gold600,  onPress: () => router.push('/social' as any) },
    { label: 'Settings',     Icon: SettingsIcon, tint: colors.gray600,  onPress: () => router.push('/settings' as any) },
    { label: 'Help & Support', Icon: HelpCircle, tint: colors.blue600,  onPress: () => Alert.alert('Help & Support', 'Contact support@umrahconnect.com') },
  ];

  const availableRoles: DashboardType[] = Array.from(new Set([
    role,
    ...(user.roles ?? []).map(r => r.toUpperCase()).map(r => {
      if (r.includes('SUPER_ADMIN') || r.includes('PLATFORM_ADMIN')) return 'admin' as const;
      if (r.includes('HOTEL')) return 'hotel' as const;
      if (r.includes('TRANSPORT')) return 'transport' as const;
      if (r.includes('COMPLIANCE') || r.includes('VISA')) return 'compliance' as const;
      if (r.includes('FINANCE') || r.includes('ACCOUNTANT')) return 'finance' as const;
      if (r.includes('PILGRIM')) return 'pilgrim' as const;
      return 'operator' as const;
    }),
  ]));

  const handleSignOut = () => Alert.alert('Sign out', 'Are you sure you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut.mutateAsync(); router.replace('/(auth)/login'); } },
  ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray50 }} edges={[]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Branded profile header */}
        <SafeAreaView edges={['top']} style={{ backgroundColor: colors.brand500 }}>
          <View style={s.header}>
            <View style={s.avatar}>
              <Text style={s.avatarTxt}>{(user.displayName ?? user.email ?? 'U').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={s.name}>{user.displayName ?? user.email}</Text>
            <View style={s.roleBadge}><Text style={s.roleBadgeTxt}>{ROLE_LABEL[role]}</Text></View>
            <View style={s.loc}>
              <MapPin color="rgba(255,255,255,0.7)" size={13} />
              <Text style={s.locTxt}>{user.tenantName ?? 'Saudi Arabia'}</Text>
            </View>
          </View>
        </SafeAreaView>

        <View style={{ padding: spacing.lg, gap: spacing.lg, marginTop: -spacing.sm }}>
          {/* Role switcher */}
          {availableRoles.length > 1 && (
            <View>
              <Text style={s.section}>Switch active role</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {availableRoles.map(dt => {
                  const sel = dt === role;
                  return (
                    <Pressable key={dt} onPress={() => setActiveDashboard(dt)} style={[s.chip, sel && s.chipActive]}>
                      <Text style={[s.chipTxt, sel && s.chipTxtActive]}>{ROLE_LABEL[dt]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Standard account rows */}
          <View style={s.cardList}>
            {STANDARD.map((r, i) => (
              <Pressable key={r.label} onPress={r.onPress} style={[s.row, i !== STANDARD.length - 1 && s.rowDivider]}>
                <View style={[s.rowIcon, { backgroundColor: colors.gray100 }]}><r.Icon color={r.tint} size={19} /></View>
                <Text style={s.rowLabel}>{r.label}</Text>
                <ChevronRight color={colors.gray300} size={18} />
              </Pressable>
            ))}
          </View>

          {/* Role workspace modules */}
          <View>
            <Text style={s.section}>Workspace</Text>
            <View style={s.cardList}>
              {modules.map((r: any, i: number) => (
                <Pressable key={r.label} onPress={() => router.push(r._href)} style={[s.row, i !== modules.length - 1 && s.rowDivider]}>
                  <View style={[s.rowIcon, { backgroundColor: colors.brand50 }]}><r.Icon color={colors.brand500} size={19} /></View>
                  <Text style={s.rowLabel}>{r.label}</Text>
                  <ChevronRight color={colors.gray300} size={18} />
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable onPress={handleSignOut} style={s.logout}>
            <LogOut color={colors.red600} size={18} /><Text style={s.logoutTxt}>Sign out</Text>
          </Pressable>
          <Text style={s.version}>Umrah Connect · v0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { alignItems: 'center', paddingBottom: spacing.xl, paddingTop: spacing.sm, gap: 6 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.gold500, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  avatarTxt: { fontSize: 34, fontFamily: font.heading, color: colors.brand700 },
  name: { fontSize: fontSize.xl, fontFamily: font.heading, color: colors.white, marginTop: 8 },
  roleBadge: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.full },
  roleBadgeTxt: { fontSize: 12, color: colors.white, fontFamily: font.bodySemi },
  loc: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locTxt: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: font.body },

  section: { fontSize: 11, color: colors.gray500, fontFamily: font.bodySemi, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  cardList: { backgroundColor: colors.white, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.gray100, overflow: 'hidden', ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  rowIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: fontSize.base, color: colors.gray800, fontFamily: font.bodyMedium },

  chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200 },
  chipActive: { backgroundColor: colors.brand500, borderColor: colors.brand500 },
  chipTxt: { fontSize: 12, color: colors.gray600, fontFamily: font.bodySemi },
  chipTxtActive: { color: colors.white },

  logout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.red50, borderRadius: radius.xl },
  logoutTxt: { color: colors.red600, fontFamily: font.bodySemi, fontSize: fontSize.base },
  version: { textAlign: 'center', fontSize: 11, color: colors.gray400, fontFamily: font.body },
});
