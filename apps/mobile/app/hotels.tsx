import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Building2, MapPin, Plus, Star, X } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, StatusBadge } from '@/components/UI';
import { useCreateHotel, useHotels, useHotelStats } from '@/hooks/use-api';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export default function HotelsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);

  const list = useHotels({ page: 1, limit: 50 });
  const stats = useHotelStats();
  const items: any[] = list.data?.items ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            <Card style={{ flex: 1 }}>
              <Text style={s.statLabel}>Total properties</Text>
              <Text style={s.statValue}>{stats.data?.total ?? items.length}</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={s.statLabel}>Active partners</Text>
              <Text style={[s.statValue, { color: colors.green600 }]}>
                {stats.data?.active ?? items.filter((i: any) => i.isActive).length}
              </Text>
            </Card>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={s.iconBox}>
                <Building2 color={colors.brand600} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.name}>{item.name}</Text>
                  {item.starRating ? (
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {Array.from({ length: item.starRating }).map((_, i) => (
                        <Star key={i} color={colors.yellow500} fill={colors.yellow500} size={11} />
                      ))}
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <MapPin color={colors.gray400} size={12} />
                  <Text style={s.meta}>{item.city ?? '—'}</Text>
                </View>
                {item.distanceToHaramMeters != null && (
                  <Text style={s.distance}>{item.distanceToHaramMeters}m from Haram</Text>
                )}
              </View>
              {item.isActive ? <StatusBadge label="Active" tone="green" /> : <StatusBadge label="Inactive" tone="gray" />}
            </View>
          </Card>
        )}
        ListEmptyComponent={
          list.isLoading
            ? <View style={{ gap: spacing.sm }}>{[0,1,2].map(i => <Skeleton key={i} h={92} style={{ borderRadius: radius.xl }} />)}</View>
            : <EmptyState icon={<Building2 color={colors.gray300} size={40} />} title="No hotels" subtitle="Tap + to add your first hotel." />
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

      <AddHotelModal open={open} onClose={() => setOpen(false)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function AddHotelModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('Makkah');
  const [country, setCountry] = useState('SA');
  const [starRating, setStarRating] = useState('5');
  const [totalRooms, setTotalRooms] = useState('');
  const [area, setArea] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [distance, setDistance] = useState('');

  const createM = useCreateHotel();

  const submit = async () => {
    if (!name.trim()) return Alert.alert('Hotel name required');
    try {
      await createM.mutateAsync({
        name: name.trim(),
        city: city.trim() || undefined,
        country: country.trim() || 'SA',
        starRating: Number(starRating) || undefined,
        totalRooms: Number(totalRooms) || undefined,
        area: area.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        distanceToHaramMeters: distance ? Number(distance) : undefined,
      });
      // reset
      setName(''); setTotalRooms(''); setArea(''); setPostalCode('');
      setContactPerson(''); setPhone(''); setEmail(''); setDistance('');
      onClose();
      Alert.alert('Hotel added', 'Your hotel is now visible across the platform.');
    } catch (e: any) {
      Alert.alert('Could not create hotel', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>Add hotel</Text>
          <Pressable onPress={submit} disabled={createM.isPending}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Hotel name *" value={name} onChangeText={setName} placeholder="Hilton Makkah" />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="City" value={city} onChangeText={setCity} placeholder="Makkah" /></View>
            <View style={{ width: 80 }}><Field label="Country" value={country} onChangeText={setCountry} placeholder="SA" autoCapitalize="characters" /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Star rating" value={starRating} onChangeText={setStarRating} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Field label="Total rooms" value={totalRooms} onChangeText={setTotalRooms} keyboardType="numeric" /></View>
          </View>
          <Field label="Area / neighborhood" value={area} onChangeText={setArea} placeholder="Ajyad" />
          <Field label="Postal code" value={postalCode} onChangeText={setPostalCode} keyboardType="numeric" />
          <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /></View>
            <View style={{ flex: 1 }}><Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View>
          </View>
          <Field label="Distance to Haram (meters)" value={distance} onChangeText={setDistance} keyboardType="numeric" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, ...rest }: any) {
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={colors.gray400} style={s.input} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  statLabel: { fontSize: fontSize.xs, color: colors.gray500 },
  statValue: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.gray900, marginTop: 4 },
  iconBox: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900, flexShrink: 1 },
  meta: { fontSize: fontSize.xs, color: colors.gray500 },
  distance: { fontSize: 11, color: colors.brand600, marginTop: 4, fontWeight: '500' },

  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand500, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100,
    backgroundColor: colors.white,
  },
  modalTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  postBtn: { color: colors.brand600, fontWeight: '700', fontSize: fontSize.base },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200,
    paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.sm, color: colors.gray900,
  },
});
