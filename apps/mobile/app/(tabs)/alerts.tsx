import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  BadgeCheck, Bell, CheckCircle2, FileCheck2, Heart, MessageCircle, Tag, UserPlus,
} from 'lucide-react-native';
import { GreenHeader, ChipTabs } from '@/components/brand';
import { useMarkAllRead, useNotifications } from '@/hooks/use-api';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

type Group = 'all' | 'bookings' | 'payments' | 'offers';

type Note = {
  id: string; group: Exclude<Group, 'all'> | 'social'; title: string; body: string;
  time: string; read?: boolean; kind: 'success' | 'payment' | 'doc' | 'offer' | 'like' | 'comment' | 'connect';
};

// Reference-style sample notifications (used when backend has none yet)
const SAMPLE: Note[] = [
  { id: 'n1', group: 'bookings', kind: 'success', title: 'Booking Confirmed',  body: 'Your hotel booking has been confirmed.',        time: '15m ago' },
  { id: 'n2', group: 'payments', kind: 'payment', title: 'Payment Successful',  body: 'Your payment of SAR 2,450 was received.',       time: '2h ago' },
  { id: 'n3', group: 'bookings', kind: 'doc',     title: 'Document Approved',   body: 'Your visa application has been approved.',      time: '3h ago' },
  { id: 'n4', group: 'offers',   kind: 'offer',   title: 'New Offer',           body: 'Special discount on Makkah hotels.',           time: '5h ago', read: true },
  { id: 'n5', group: 'social',   kind: 'like',    title: 'Yousuf liked your post', body: 'Your post received a new reaction.',       time: '6h ago', read: true },
  { id: 'n6', group: 'social',   kind: 'connect', title: 'New connection request', body: 'Aisha Rahman wants to connect.',           time: '1d ago', read: true },
];

const ICONS: Record<Note['kind'], { Icon: any; bg: string; fg: string }> = {
  success: { Icon: CheckCircle2, bg: '#E6F4EC', fg: colors.green500 },
  payment: { Icon: BadgeCheck,   bg: '#E6F4EC', fg: colors.green600 },
  doc:     { Icon: FileCheck2,   bg: '#FBF1DC', fg: colors.yellow600 },
  offer:   { Icon: Tag,          bg: '#F7E7E7', fg: colors.red500 },
  like:    { Icon: Heart,        bg: '#F7E7E7', fg: colors.red500 },
  comment: { Icon: MessageCircle,bg: '#E6EEFB', fg: colors.blue500 },
  connect: { Icon: UserPlus,     bg: '#E7EFEC', fg: colors.brand500 },
};

export default function AlertsScreen() {
  const [tab, setTab] = useState<Group>('all');
  const [refreshing, setRefreshing] = useState(false);
  const notifs = useNotifications();
  const markAll = useMarkAllRead();

  // Map backend notifications → Note shape (REAL data only; no fake samples)
  const kindOf = (type?: string): Note['kind'] => {
    const v = (type ?? '').toUpperCase();
    if (v.includes('BOOK')) return 'success';
    if (v.includes('PAY')) return 'payment';
    if (v.includes('DOC') || v.includes('VISA')) return 'doc';
    if (v.includes('OFFER')) return 'offer';
    if (v.includes('LIKE') || v.includes('REACT')) return 'like';
    if (v.includes('COMMENT')) return 'comment';
    return 'connect';
  };
  const groupOf = (type?: string): Note['group'] => {
    const v = (type ?? '').toUpperCase();
    if (v.includes('BOOK')) return 'bookings';
    if (v.includes('PAY')) return 'payments';
    if (v.includes('OFFER')) return 'offers';
    return 'social';
  };
  const items = useMemo<Note[]>(() => {
    const real: Note[] = (notifs.data?.items ?? notifs.data ?? []).map((n: any, i: number) => ({
      id: n.id ?? `r${i}`,
      group: groupOf(n.type),
      kind: kindOf(n.type),
      title: n.title ?? n.type ?? 'Notification',
      body: n.body ?? n.message ?? '',
      time: n.createdAt ? new Date(n.createdAt).toLocaleDateString() : '',
      read: !!n.readAt,
    }));
    return tab === 'all' ? real : real.filter((n) => n.group === tab);
  }, [notifs.data, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <GreenHeader
        title="Notifications"
        right={
          <Pressable onPress={() => markAll.mutate()} hitSlop={8}>
            <Bell color={colors.white} size={20} />
          </Pressable>
        }
      />
      <ChipTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'bookings', label: 'Bookings' },
          { key: 'payments', label: 'Payments' },
          { key: 'offers', label: 'Offers' },
        ]}
      />

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const cfg = ICONS[item.kind];
          return (
            <View style={[s.row, !item.read && s.unread]}>
              <View style={[s.icon, { backgroundColor: cfg.bg }]}>
                <cfg.Icon color={cfg.fg} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{item.title}</Text>
                <Text style={s.body} numberOfLines={2}>{item.body}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.time}>{item.time}</Text>
                {!item.read && <View style={s.dot} />}
              </View>
            </View>
          );
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true); await notifs.refetch?.(); setRefreshing(false);
          }} />
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: spacing['3xl'] }}>
            <Bell color={colors.gray300} size={40} />
            <Text style={{ marginTop: 12, color: colors.gray500, fontFamily: font.body }}>You're all caught up</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  unread: { borderColor: colors.brand100, backgroundColor: '#FCFBF8' },
  icon: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.sm, fontFamily: font.headingSemi, color: colors.gray900 },
  body: { fontSize: 12, color: colors.gray500, fontFamily: font.body, marginTop: 2, lineHeight: 16 },
  time: { fontSize: 10, color: colors.gray400, fontFamily: font.body },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold500 },
});
