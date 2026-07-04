import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Save, ServerCog, UserRound } from 'lucide-react-native';
import { apiClient, getApiOverride } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { PrimaryButton } from '@/components/brand';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

/** Functional settings: edit social profile — persisted via PUT /social/accounts/me. */
export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const account = useQuery({
    queryKey: ['social', 'account', 'me'],
    queryFn: async () => (await apiClient.get('/social/accounts/me')).data?.data,
  });

  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [apiUrl, setApiUrl] = useState('(built-in)');

  useEffect(() => {
    if (account.data) {
      setDisplayName(account.data.displayName ?? '');
      setHeadline(account.data.headline ?? '');
      setBio(account.data.bio ?? '');
    }
  }, [account.data]);
  useEffect(() => { getApiOverride().then((v) => setApiUrl(v ?? '(built-in)')); }, []);

  const save = useMutation({
    mutationFn: async () =>
      (await apiClient.put('/social/accounts/me', {
        displayName: displayName.trim() || undefined,
        headline: headline.trim() || undefined,
        bio: bio.trim() || undefined,
      })).data?.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social'] });
      Alert.alert('Saved', 'Your profile has been updated.');
    },
    onError: (e: any) => Alert.alert('Save failed', String(e?.response?.data?.error?.message ?? e?.message ?? e)),
  });

  return (
    <ScrollView style={{ backgroundColor: colors.gray50 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 60 }}>
      {/* Profile */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <UserRound color={colors.brand500} size={18} />
          <Text style={s.cardTitle}>Public profile</Text>
        </View>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" />
        <Field label="Headline" value={headline} onChangeText={setHeadline} placeholder="e.g. Umrah operator · Makkah" />
        <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Tell the community about yourself" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: 'top' }} />
        <PrimaryButton title="Save profile" loading={save.isPending} onPress={() => save.mutate()} left={<Save color={colors.white} size={16} />} />
      </View>

      {/* Account */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <Globe color={colors.brand500} size={18} />
          <Text style={s.cardTitle}>Account</Text>
        </View>
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Workspace" value={user?.tenantName ?? user?.tenantSlug ?? '—'} />
        <Row label="Role" value={(user?.roles ?? []).join(', ') || '—'} />
      </View>

      {/* Server (runtime API override) */}
      <View style={s.card}>
        <View style={s.cardHead}>
          <ServerCog color={colors.brand500} size={18} />
          <Text style={s.cardTitle}>API server</Text>
        </View>
        <Row label="Override" value={apiUrl} />
        <Text style={s.hint}>Change the server from the login screen ("Server" link) — no reinstall needed when the backend URL changes.</Text>
      </View>

      {account.isLoading && <ActivityIndicator color={colors.brand500} />}
      <Text style={s.version}>Umrah Connect · v0.1.0</Text>
    </ScrollView>
  );
}

function Field({ label, ...rest }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput {...rest} placeholderTextColor={colors.gray400} style={[s.input, rest.style]} />
    </View>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md },
  cardTitle: { fontSize: fontSize.base, fontFamily: font.headingSemi, color: colors.gray900 },
  label: { fontSize: 11, fontFamily: font.bodySemi, color: colors.gray600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: colors.gray50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.sm, color: colors.gray900, fontFamily: font.body },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  rowLabel: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.body },
  rowValue: { fontSize: fontSize.sm, color: colors.gray800, fontFamily: font.bodyMedium, maxWidth: '60%' },
  hint: { fontSize: 11, color: colors.gray400, fontFamily: font.body, marginTop: 8, lineHeight: 16 },
  version: { textAlign: 'center', fontSize: 11, color: colors.gray400, fontFamily: font.body },
});
