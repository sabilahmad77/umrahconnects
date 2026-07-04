import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Bus, MapPin, Plus, UserCircle, X } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, StatusBadge } from '@/components/UI';
import {
  useCreateDriver, useCreateRoute, useCreateVehicle,
  useTransportDrivers, useTransportRoutes, useTransportStats, useTransportVehicles,
} from '@/hooks/use-api';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Tab = 'vehicles' | 'drivers' | 'routes';

export default function TransportScreen() {
  const [tab, setTab] = useState<Tab>('vehicles');
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const vehicles = useTransportVehicles();
  const drivers = useTransportDrivers();
  const routes = useTransportRoutes();
  const stats = useTransportStats();

  const data: any = tab === 'vehicles' ? vehicles : tab === 'drivers' ? drivers : routes;
  const items: any[] = data.data?.items ?? data.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.gray50 }}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        data={items}
        keyExtractor={(it, idx) => String(it?.id ?? idx)}
        ListHeaderComponent={
          <View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <Card style={{ flex: 1 }}>
                <Text style={s.statLabel}>Vehicles</Text>
                <Text style={s.statValue}>{stats.data?.vehicles ?? vehicles.data?.items?.length ?? 0}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={s.statLabel}>Drivers</Text>
                <Text style={s.statValue}>{stats.data?.drivers ?? drivers.data?.items?.length ?? 0}</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <Text style={s.statLabel}>Routes</Text>
                <Text style={s.statValue}>{stats.data?.routes ?? routes.data?.items?.length ?? 0}</Text>
              </Card>
            </View>
            <View style={s.tabRow}>
              {(['vehicles', 'drivers', 'routes'] as Tab[]).map(t => (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[s.tab, tab === t && s.tabActive]}
                >
                  <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) =>
          tab === 'vehicles' ? <VehicleCard item={item} /> :
          tab === 'drivers'  ? <DriverCard item={item} /> :
                               <RouteCard item={item} />
        }
        ListEmptyComponent={
          data.isLoading
            ? <View style={{ gap: spacing.sm }}>{[0,1,2].map(i => <Skeleton key={i} h={80} style={{ borderRadius: radius.xl }} />)}</View>
            : <EmptyState
                icon={<Bus color={colors.gray300} size={40} />}
                title={`No ${tab}`}
                subtitle={`Tap + to add your first ${tab.slice(0, -1)}.`}
              />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => {
            setRefreshing(true);
            await Promise.allSettled([data.refetch(), stats.refetch()]);
            setRefreshing(false);
          }} />
        }
      />

      <Pressable style={s.fab} onPress={() => setOpen(true)}>
        <Plus color={colors.white} size={24} />
      </Pressable>

      {open && tab === 'vehicles' && <AddVehicleModal onClose={() => setOpen(false)} />}
      {open && tab === 'drivers' && <AddDriverModal onClose={() => setOpen(false)} />}
      {open && tab === 'routes' && <AddRouteModal onClose={() => setOpen(false)} />}
    </View>
  );
}

function VehicleCard({ item }: { item: any }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={[s.iconBox, { backgroundColor: colors.purple50 }]}>
          <Bus color={colors.purple600} size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.make ?? '—'} {item.model ?? ''}</Text>
          <Text style={s.meta}>{item.plateNumber ?? item.licensePlate ?? '—'} · {item.capacity ?? 0} seats</Text>
        </View>
        <StatusBadge label={item.status ?? 'Ready'} tone="green" />
      </View>
    </Card>
  );
}
function DriverCard({ item }: { item: any }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={[s.iconBox, { backgroundColor: colors.blue50 }]}>
          <UserCircle color={colors.blue600} size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.firstName} {item.lastName}</Text>
          <Text style={s.meta}>{item.licenseNumber ?? '—'} · {item.phone ?? ''}</Text>
        </View>
        <StatusBadge label={item.status ?? 'Active'} tone="blue" />
      </View>
    </Card>
  );
}
function RouteCard({ item }: { item: any }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={[s.iconBox, { backgroundColor: colors.green50 }]}>
          <MapPin color={colors.green600} size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{item.name}</Text>
          <Text style={s.meta}>{item.originCity ?? '—'} → {item.destCity ?? item.destinationCity ?? '—'}</Text>
        </View>
      </View>
    </Card>
  );
}

function AddVehicleModal({ onClose }: { onClose: () => void }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [type, setType] = useState('VAN');
  const createM = useCreateVehicle();

  const submit = async () => {
    if (!make.trim() || !model.trim() || !plateNumber.trim()) {
      return Alert.alert('Required', 'Make, model and plate number are required.');
    }
    try {
      await createM.mutateAsync({
        make: make.trim(), model: model.trim(), year: Number(year) || undefined,
        plateNumber: plateNumber.trim(), capacity: Number(capacity) || undefined, type,
      });
      onClose();
      Alert.alert('Vehicle added');
    } catch (e: any) {
      Alert.alert('Could not create vehicle', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <FormModal title="Add vehicle" onClose={onClose} onSave={submit} loading={createM.isPending}>
      <Field label="Make *" value={make} onChangeText={setMake} placeholder="Mercedes" />
      <Field label="Model *" value={model} onChangeText={setModel} placeholder="Sprinter" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Year" value={year} onChangeText={setYear} keyboardType="numeric" /></View>
        <View style={{ flex: 1 }}><Field label="Capacity" value={capacity} onChangeText={setCapacity} keyboardType="numeric" /></View>
      </View>
      <Field label="Plate number *" value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" />
      <PickerRow label="Type" value={type} options={['VAN', 'BUS', 'CAR', 'COASTER']} onChange={setType} />
    </FormModal>
  );
}

function AddDriverModal({ onClose }: { onClose: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('2030-12-31');
  const createM = useCreateDriver();

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !licenseNumber.trim()) {
      return Alert.alert('Required', 'All fields are required.');
    }
    try {
      await createM.mutateAsync({
        firstName: firstName.trim(), lastName: lastName.trim(),
        phone: phone.trim(), licenseNumber: licenseNumber.trim(), licenseExpiry,
      });
      onClose();
      Alert.alert('Driver added');
    } catch (e: any) {
      Alert.alert('Could not create driver', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <FormModal title="Add driver" onClose={onClose} onSave={submit} loading={createM.isPending}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="First name *" value={firstName} onChangeText={setFirstName} /></View>
        <View style={{ flex: 1 }}><Field label="Last name *" value={lastName} onChangeText={setLastName} /></View>
      </View>
      <Field label="Phone *" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+966500000000" />
      <Field label="License number *" value={licenseNumber} onChangeText={setLicenseNumber} autoCapitalize="characters" />
      <Field label="License expiry (YYYY-MM-DD)" value={licenseExpiry} onChangeText={setLicenseExpiry} />
    </FormModal>
  );
}

function AddRouteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [originCity, setOriginCity] = useState('Madinah');
  const [destCity, setDestCity] = useState('Makkah');
  const [distanceKm, setDistanceKm] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const createM = useCreateRoute();

  const submit = async () => {
    if (!name.trim()) return Alert.alert('Route name required');
    try {
      await createM.mutateAsync({
        name: name.trim(),
        originCity: originCity.trim() || undefined,
        destCity: destCity.trim() || undefined,
        distanceKm: Number(distanceKm) || undefined,
        estimatedDuration: Number(estimatedDuration) || undefined,
      });
      onClose();
      Alert.alert('Route added');
    } catch (e: any) {
      Alert.alert('Could not create route', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <FormModal title="Add route" onClose={onClose} onSave={submit} loading={createM.isPending}>
      <Field label="Route name *" value={name} onChangeText={setName} placeholder="Madinah ↔ Makkah" />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Origin city" value={originCity} onChangeText={setOriginCity} /></View>
        <View style={{ flex: 1 }}><Field label="Destination city" value={destCity} onChangeText={setDestCity} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Field label="Distance (km)" value={distanceKm} onChangeText={setDistanceKm} keyboardType="numeric" /></View>
        <View style={{ flex: 1 }}><Field label="Est. duration (min)" value={estimatedDuration} onChangeText={setEstimatedDuration} keyboardType="numeric" /></View>
      </View>
    </FormModal>
  );
}

function FormModal({
  title, onClose, onSave, loading, children,
}: { title: string; onClose: () => void; onSave: () => void; loading: boolean; children: any }) {
  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>{title}</Text>
          <Pressable onPress={onSave} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {children}
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

function PickerRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <View>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => (
          <Pressable key={opt} onPress={() => onChange(opt)} style={[s.pickerChip, value === opt && s.pickerChipActive]}>
            <Text style={[s.pickerText, value === opt && s.pickerTextActive]}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  statLabel: { fontSize: fontSize.xs, color: colors.gray500 },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray900, marginTop: 2 },
  iconBox: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.sm, fontWeight: '700', color: colors.gray900 },
  meta: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },

  tabRow: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.xl, padding: 4, borderWidth: 1, borderColor: colors.gray100, marginBottom: spacing.md },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.lg, alignItems: 'center' },
  tabActive: { backgroundColor: colors.brand50 },
  tabText: { fontSize: fontSize.sm, color: colors.gray500, fontWeight: '600', textTransform: 'capitalize' },
  tabTextActive: { color: colors.brand600 },

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

  pickerChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200 },
  pickerChipActive: { backgroundColor: colors.brand50, borderColor: colors.brand500 },
  pickerText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600' },
  pickerTextActive: { color: colors.brand700 },
});
