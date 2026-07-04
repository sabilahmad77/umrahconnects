import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { FileCheck2, Plus, X } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, StatusBadge } from '@/components/UI';
import { useCreateVisa, usePilgrims, useVisas, useVisaStats } from '@/hooks/use-api';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, any> = {
  DOCUMENTS_COLLECTING: 'gray',
  DOCUMENTS_COMPLETE: 'blue',
  SUBMITTED: 'blue',
  IN_REVIEW: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
  ISSUED: 'purple',
};

export default function ComplianceScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const list = useVisas({ page: 1, limit: 50 });
  const stats = useVisaStats();
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
              <Text style={[s.statValue, { color: colors.green600 }]}>{stats.data?.byStatus?.APPROVED ?? 0}</Text>
              <Text style={s.statLabel}>Approved</Text>
            </Card>
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[s.statValue, { color: colors.purple600 }]}>{stats.data?.successRate != null ? `${Number(stats.data.successRate).toFixed(0)}%` : '—'}</Text>
              <Text style={s.statLabel}>Success</Text>
            </Card>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const name = item.pilgrim ? `${item.pilgrim.firstNameEn ?? ''} ${item.pilgrim.lastNameEn ?? ''}`.trim() || '—' : '—';
          return (
            <Card>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <View style={s.iconBox}><FileCheck2 color={colors.yellow600} size={22} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{name}</Text>
                  <Text style={s.meta}>{item.visaType ?? 'UMRAH'} · {(item.system ?? item.regulatorySystem ?? '').replace(/_/g, ' ')}</Text>
                </View>
                <StatusBadge label={item.status?.replace(/_/g, ' ') ?? '—'} tone={STATUS_TONE[item.status] ?? 'gray'} />
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          list.isLoading
            ? <View style={{ gap: spacing.sm }}>{[0,1,2].map(i => <Skeleton key={i} h={72} style={{ borderRadius: radius.xl }} />)}</View>
            : <EmptyState icon={<FileCheck2 color={colors.gray300} size={40} />} title="No visa applications" subtitle="Tap + to create one." />
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

      {open && <AddVisaModal onClose={() => setOpen(false)} />}
    </View>
  );
}

function AddVisaModal({ onClose }: { onClose: () => void }) {
  const [visaType, setVisaType] = useState('UMRAH');
  const [pilgrimId, setPilgrimId] = useState('');
  const [country, setCountry] = useState('SA');
  const [system, setSystem] = useState('NUSUK_MASAR');
  const createM = useCreateVisa();
  const pilgrims = usePilgrims({ page: 1, limit: 30 });
  const pilgrimList: any[] = pilgrims.data?.items ?? [];

  const submit = async () => {
    if (!pilgrimId) return Alert.alert('Select a pilgrim');
    try {
      await createM.mutateAsync({
        pilgrimId, visaType, country, regulatorySystem: system,
      });
      onClose();
      Alert.alert('Visa application created');
    } catch (e: any) {
      Alert.alert('Could not create visa', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>New visa application</Text>
          <Pressable onPress={submit} disabled={createM.isPending}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={s.fieldLabel}>Pilgrim *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {pilgrimList.length === 0 ? (
                <Text style={s.meta}>{pilgrims.isLoading ? 'Loading…' : 'No pilgrims yet — add one first.'}</Text>
              ) : pilgrimList.map(p => {
                const name = `${p.firstNameEn ?? p.firstName ?? ''} ${p.lastNameEn ?? p.lastName ?? ''}`.trim() || 'Unnamed';
                return (
                  <Pressable key={p.id} onPress={() => setPilgrimId(p.id)} style={[s.chip, pilgrimId === p.id && s.chipActive]}>
                    <Text style={[s.chipText, pilgrimId === p.id && s.chipTextActive]} numberOfLines={1}>{name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          <View>
            <Text style={s.fieldLabel}>Visa type</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['UMRAH', 'HAJJ', 'TOURIST', 'BUSINESS'].map(t => (
                <Pressable key={t} onPress={() => setVisaType(t)} style={[s.chip, visaType === t && s.chipActive]}>
                  <Text style={[s.chipText, visaType === t && s.chipTextActive]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ width: 100 }}>
              <Text style={s.fieldLabel}>Country</Text>
              <TextInput value={country} onChangeText={setCountry} autoCapitalize="characters" style={s.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>System</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {['NUSUK_MASAR', 'SISKOPATUH', 'NAHCON', 'DIYANET', 'TABUNG_HAJI', 'MOTAC'].map(opt => (
                  <Pressable key={opt} onPress={() => setSystem(opt)} style={[s.chip, system === opt && s.chipActive]}>
                    <Text style={[s.chipText, system === opt && s.chipTextActive]}>{opt.replace('_', ' ')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  statValue: { fontSize: fontSize['2xl'], fontWeight: '700', color: colors.gray900 },
  statLabel: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },
  iconBox: { width: 38, height: 38, borderRadius: radius.lg, backgroundColor: colors.yellow50, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray800 },
  meta: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },

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
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray200 },
  chipActive: { backgroundColor: colors.brand50, borderColor: colors.brand500 },
  chipText: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600' },
  chipTextActive: { color: colors.brand700 },
});
