import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Search, UserCircle2, Users, X } from 'lucide-react-native';
import { Card, EmptyState, ScreenTitle, Skeleton, StatusBadge } from '@/components/UI';
import { useCreatePilgrim, usePilgrims, usePilgrimStats } from '@/hooks/use-api';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, any> = {
  LEAD: 'gray',
  BOOKED: 'blue',
  IN_KSA: 'green',
  RETURNED: 'purple',
  CANCELLED: 'red',
};

export default function PilgrimsScreen() {
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const list = usePilgrims({ page: 1, limit: 50, search: search || undefined });
  const stats = usePilgrimStats();

  const items: any[] = list.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray50 }} edges={['top']}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <ScreenTitle title="Pilgrims" subtitle={`${list.data?.total ?? 0} records · CRM`} />
            {/* stat cards */}
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Card style={{ flex: 1 }}>
                <Text style={s.statLabel}>Total</Text>
                <Text style={s.statValue}>{stats.data?.total ?? '—'}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={s.statLabel}>In KSA</Text>
                <Text style={[s.statValue, { color: colors.green600 }]}>{stats.data?.byStatus?.IN_KSA ?? 0}</Text>
              </Card>
            </View>
            {/* search */}
            <View style={s.searchWrap}>
              <Search color={colors.gray400} size={16} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name, passport, phone…"
                placeholderTextColor={colors.gray400}
                style={s.searchInput}
                autoCapitalize="none"
              />
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const name = [item.firstNameEn, item.lastNameEn].filter(Boolean).join(' ') || item.firstNameAr || 'Unnamed';
          return (
            <TouchableOpacity activeOpacity={0.7}>
              <Card style={s.pilgrimRow}>
                <View style={s.pilgrimAvatar}>
                  <UserCircle2 color={colors.brand600} size={26} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.pilgrimName} numberOfLines={1}>{name}</Text>
                  <Text style={s.pilgrimMeta} numberOfLines={1}>
                    {item.passportNo ?? '—'} · {item.nationality ?? '—'}
                  </Text>
                </View>
                <StatusBadge label={item.status?.replace(/_/g, ' ') ?? '—'} tone={STATUS_TONE[item.status] ?? 'gray'} />
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          list.isLoading ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {[0,1,2,3,4].map(i => <Skeleton key={i} h={72} style={{ borderRadius: radius.xl }} />)}
            </View>
          ) : (
            <EmptyState icon={<Users color={colors.gray300} size={40} />} title="No pilgrims yet" subtitle="Add pilgrims from your web workspace." />
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

      <Pressable style={s.fab} onPress={() => setOpen(true)}>
        <Plus color={colors.white} size={24} />
      </Pressable>

      {open && <AddPilgrimModal onClose={() => setOpen(false)} />}
    </SafeAreaView>
  );
}

function AddPilgrimModal({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const [nationality, setNationality] = useState('SA');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const createM = useCreatePilgrim();

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !passportNumber.trim()) {
      return Alert.alert('Required', 'First name, last name, and passport are required.');
    }
    try {
      await createM.mutateAsync({
        firstName: firstName.trim(), lastName: lastName.trim(),
        phone: phone.trim() || undefined, email: email.trim() || undefined,
        passportNumber: passportNumber.trim(), dateOfBirth: dob,
        nationality, gender,
      });
      onClose();
      Alert.alert('Pilgrim added');
    } catch (e: any) {
      Alert.alert('Could not create pilgrim', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>Add pilgrim</Text>
          <Pressable onPress={submit} disabled={createM.isPending}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="First name *" value={firstName} onChangeText={setFirstName} /></View>
            <View style={{ flex: 1 }}><Field label="Last name *" value={lastName} onChangeText={setLastName} /></View>
          </View>
          <Field label="Passport number *" value={passportNumber} onChangeText={setPassportNumber} autoCapitalize="characters" />
          <Field label="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ width: 90 }}><Field label="Nationality" value={nationality} onChangeText={setNationality} autoCapitalize="characters" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>Gender</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['MALE', 'FEMALE'] as const).map(g => (
                  <Pressable key={g} onPress={() => setGender(g)} style={[s.chip, gender === g && s.chipActive]}>
                    <Text style={[s.chipText, gender === g && s.chipTextActive]}>{g}</Text>
                  </Pressable>
                ))}
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
  statLabel: { fontSize: fontSize.xs, color: colors.gray500 },
  statValue: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.gray900, marginTop: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.xl,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.gray100,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, color: colors.gray900, paddingVertical: spacing.sm },
  pilgrimRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pilgrimAvatar: { width: 40, height: 40, borderRadius: radius.lg, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  pilgrimName: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray800 },
  pilgrimMeta: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },

  fab: {
    position: 'absolute', bottom: 100, right: 24,
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
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200, flex: 1, alignItems: 'center' },
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand500 },
  chipText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600' },
  chipTextActive: { color: colors.brand700 },
});
