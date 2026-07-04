import { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, Clock, FileText, Plus, X } from 'lucide-react-native';
import { Card, EmptyState, ScreenTitle, Skeleton, StatusBadge } from '@/components/UI';
import { useCreateInvoice, useFinanceInvoices, useFinanceStats } from '@/hooks/use-api';
import { colors, fmtSAR, fontSize, radius, spacing } from '@/lib/theme';

const STATUS_TONE: Record<string, any> = {
  DRAFT: 'gray', ISSUED: 'blue', SENT: 'blue',
  PARTIALLY_PAID: 'yellow', PAID: 'green', OVERDUE: 'red', VOID: 'gray',
};

export default function FinanceScreen() {
  const stats = useFinanceStats();
  const list = useFinanceInvoices({ page: 1, limit: 50 });
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const items: any[] = list.data?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.gray50 }} edges={['top']}>
      <FlatList
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <ScreenTitle title="Finance" subtitle="Invoices, payments, revenue" />

            {/* Hero stat */}
            <View style={s.heroCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <CheckCircle2 color={colors.white} size={18} />
                <Text style={s.heroLabel}>Revenue Collected</Text>
              </View>
              <Text style={s.heroValue}>{fmtSAR(stats.data?.paid?.amountCents)}</Text>
              <Text style={s.heroSub}>{stats.data?.paid?.count ?? 0} invoices paid</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Card style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock color={colors.yellow600} size={16} />
                  <Text style={s.statLabel}>Outstanding</Text>
                </View>
                <Text style={s.statValue}>{fmtSAR(stats.data?.outstanding?.amountCents)}</Text>
                <Text style={s.statSub}>{stats.data?.outstanding?.count ?? 0} pending</Text>
              </Card>
              <Card style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FileText color={colors.gray500} size={16} />
                  <Text style={s.statLabel}>Draft</Text>
                </View>
                <Text style={s.statValue}>{fmtSAR(stats.data?.draft?.amountCents)}</Text>
                <Text style={s.statSub}>{stats.data?.draft?.count ?? 0} drafts</Text>
              </Card>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const isOverdue = item.status === 'OVERDUE';
          const name = item.pilgrim
            ? `${item.pilgrim.firstNameEn ?? ''} ${item.pilgrim.lastNameEn ?? ''}`.trim() || '—'
            : item.issuedToName ?? item.clientName ?? '—';
          return (
            <Card>
              <View style={s.invHead}>
                <View style={[s.invIcon, { backgroundColor: isOverdue ? colors.red50 : colors.brand50 }]}>
                  <FileText color={isOverdue ? colors.red600 : colors.brand600} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.invRef}>{item.invoiceRef ?? item.id?.slice(0, 8)}</Text>
                  <Text style={s.invMeta}>{name}</Text>
                </View>
                <StatusBadge label={item.status?.replace(/_/g, ' ') ?? '—'} tone={STATUS_TONE[item.status] ?? 'gray'} />
              </View>
              <View style={s.invFoot}>
                <Text style={[s.invAmount, isOverdue && { color: colors.red600 }]}>{fmtSAR(item.totalCents)}</Text>
                <Text style={s.invDate}>
                  Due: {(item.dueAt ?? item.dueDate) ? new Date(item.dueAt ?? item.dueDate).toLocaleDateString() : '—'}
                </Text>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          list.isLoading ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {[0,1,2,3].map(i => <Skeleton key={i} h={90} style={{ borderRadius: radius.xl }} />)}
            </View>
          ) : <EmptyState icon={<FileText color={colors.gray300} size={40} />} title="No invoices" />
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

      {open && <AddInvoiceModal onClose={() => setOpen(false)} />}
    </SafeAreaView>
  );
}

function AddInvoiceModal({ onClose }: { onClose: () => void }) {
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('Service rendered');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const createM = useCreateInvoice();

  const submit = async () => {
    if (!clientName.trim() || !amount.trim()) {
      return Alert.alert('Required', 'Client name and amount required.');
    }
    try {
      await createM.mutateAsync({
        clientName: clientName.trim(),
        currency: 'SAR',
        dueDate: dueDate || undefined,
        lineItems: [
          { description: description.trim() || 'Service', quantity: 1, unitPriceCents: Math.round(Number(amount) * 100) },
        ],
      });
      onClose();
      Alert.alert('Invoice created');
    } catch (e: any) {
      Alert.alert('Could not create invoice', String(e?.response?.data?.error?.message ?? e?.message ?? e));
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.gray50 }}>
        <View style={s.modalHeader}>
          <Pressable onPress={onClose}><X size={24} color={colors.gray600} /></Pressable>
          <Text style={s.modalTitle}>New invoice</Text>
          <Pressable onPress={submit} disabled={createM.isPending}>
            {createM.isPending ? <ActivityIndicator color={colors.brand600} /> : <Text style={s.postBtn}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <View>
            <Text style={s.fLabel}>Client name *</Text>
            <TextInput value={clientName} onChangeText={setClientName} placeholder="Al-Haramain Tours" placeholderTextColor={colors.gray400} style={s.input} />
          </View>
          <View>
            <Text style={s.fLabel}>Description</Text>
            <TextInput value={description} onChangeText={setDescription} placeholder="Service rendered" placeholderTextColor={colors.gray400} style={s.input} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={s.fLabel}>Amount (SAR) *</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" style={s.input} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fLabel}>Due date (YYYY-MM-DD)</Text>
              <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-08-01" placeholderTextColor={colors.gray400} style={s.input} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.brand500,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: 6,
  },
  heroLabel: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600', opacity: 0.9 },
  heroValue: { color: colors.white, fontSize: fontSize['3xl'], fontWeight: '700', marginTop: 4 },
  heroSub: { color: colors.white, fontSize: fontSize.xs, opacity: 0.8 },
  statLabel: { fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600' },
  statValue: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray900, marginTop: 6 },
  statSub: { fontSize: 11, color: colors.gray400, marginTop: 2 },
  invHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  invIcon: { width: 36, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  invRef: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  invMeta: { fontSize: fontSize.xs, color: colors.gray500, marginTop: 2 },
  invFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.gray100 },
  invAmount: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray800 },
  invDate: { fontSize: fontSize.xs, color: colors.gray500 },

  fab: {
    position: 'absolute', bottom: 100, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brand500, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.brand500, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.gray100, backgroundColor: colors.white },
  modalTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray900 },
  postBtn: { color: colors.brand600, fontWeight: '700', fontSize: fontSize.base },
  fLabel: { fontSize: 11, fontWeight: '700', color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200,
    paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.sm, color: colors.gray900,
  },
});
