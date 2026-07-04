import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { CalendarDays, Plus, UsersRound, X } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, StatusBadge } from '@/components/UI';
import { useCreateGroup, useGroups, useGroupStats } from '@/hooks/use-api';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, any> = {
  PLANNING: 'gray', CONFIRMED: 'green', IN_PROGRESS: 'brand', COMPLETED: 'purple', CANCELLED: 'red',
};

export default function GroupsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const list = useGroups({ page: 1, limit: 50 });
  const stats = useGroupStats();
  const items: any[] = list.data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.statValue}>{stats.data?.total ?? items.length}</Text>
              <Text style={s.statLabel}>Total</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[s.statValue, { color: colors.green600 }]}>{stats.data?.active ?? 0}</Text>
              <Text style={s.statLabel}>Active</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[s.statValue, { color: colors.purple600 }]}>{stats.data?.completed ?? 0}</Text>
              <Text style={s.statLabel}>Done</Text>
            </Card>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const pct = item.capacity ? Math.round(((item.bookedCount ?? 0) / item.capacity) * 100) : 0;
          return (
            <Card>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
                <View style={s.iconBox}><UsersRound color={colors.brand600} size={22} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <CalendarDays color={colors.gray400} size={12} />
                    <Text style={s.meta}>
                      {item.departureDate ? new Date(item.departureDate).toLocaleDateString() : '—'} → {item.returnDate ? new Date(item.returnDate).toLocaleDateString() : '—'}
                    </Text>
                  </View>
                </View>
                <StatusBadge label={item.status?.replace(/_/g, ' ') ?? '—'} tone={STATUS_TONE[item.status] ?? 'gray'} />
              </View>
              <View style={{ marginTop: spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={s.meta}>Capacity</Text>
                  <Text style={s.metaBold}>{item.bookedCount ?? 0} / {item.capacity ?? 0}</Text>
                </View>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${pct}%` }]} />
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          list.isLoading
            ? <View style={{ gap: spacing.sm }}>{[0,1,2].map(i => <Skeleton key={i} h={120} style={{ borderRadius: radius.xl }} />)}</View>
            : <EmptyState icon={<UsersRound color={colors.gray300} size={40} />} title="No groups yet" subtitle="Tap + to create your first group." />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await Promise.allSettled([list.refetch(), stats.refetch()]);
            setRefreshing(false);
          }} />
        }
      />

      <Pressable style={s.fab} onPress={() => setOpen(true)}>
        <Plus color={colors.white} size={24} />
      </Pressable>

      {open && <AddGroupModal onClose={() => setOpen(false)} />}
    </View>
  );
}

function AddGroupModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('UMRAH');
  const [capacity, setCapacity] = useState('30');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const createM = useCreateGroup();

  const submit = async () => {
    if (!name.trim()) return Alert.alert('Group name required');
    try {
      await createM.mutateAsync({
        name: name.trim(),
        tripType: type,
        capacity: Number(capacity) || 30,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
        visibility: isPublic ? 'PUBLIC' : 'PRIVATE',
      });
      onClose();
      Alert.alert('Group created');
    } catch (e: any) {
      Alert.alert('Could not create group', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>New group</Text>
          <Pressable onPress={submit} disabled={createM.isPending}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Group name *" value={name} onChangeText={setName} placeholder="Eid Umrah 2026" />
          <View>
            <Text style={s.fieldLabel}>Type</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['UMRAH', 'HAJJ', 'ZIYARAT', 'OTHER'].map(t => (
                <Pressable key={t} onPress={() => setType(t)} style={[s.chip, type === t && s.chipActive]}>
                  <Text style={[s.chipText, type === t && s.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Departure (YYYY-MM-DD)" value={departureDate} onChangeText={setDepartureDate} /></View>
            <View style={{ flex: 1 }}><Field label="Return (YYYY-MM-DD)" value={returnDate} onChangeText={setReturnDate} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Visibility</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable onPress={() => setIsPublic(true)} style={[s.chip, isPublic && s.chipActive]}>
                  <Text style={[s.chipText, isPublic && s.chipTextActive]}>Public</Text>
                </Pressable>
                <Pressable onPress={() => setIsPublic(false)} style={[s.chip, !isPublic && s.chipActive]}>
                  <Text style={[s.chipText, !isPublic && s.chipTextActive]}>Private</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, ...rest }: any) {
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={colors.gray400} style={s.input} />
    </View>
  );
}

const s = StyleSheet.create({
  statValue: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },
  iconBox: { width: 42, height: 42, borderRadius: radius.lg, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  meta: { fontSize: fontSize.xs, color: colors.gray500 },
  metaBold: { fontSize: fontSize.xs, color: colors.gray700, fontWeight: '700' },
  bar: { height: 6, backgroundColor: colors.gray100, borderRadius: 999, marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.brand500, borderRadius: 999 },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand500, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100, backgroundColor: colors.white },
  modalTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  postBtn: { color: colors.brand600, fontWeight: '700', fontSize: fontSize.base },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200,
    paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.sm, color: colors.gray900,
  },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200 },
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand500 },
  chipText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600' },
  chipTextActive: { color: colors.brand700 },
});
