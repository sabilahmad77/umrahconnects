import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useLogin, useLoginAsDemo } from '@/hooks/use-api';
import { apiClient, getApiOverride, setApiOverride } from '@/lib/api';
import { getDashboardPath, DashboardType } from '@/lib/auth';
import { PrimaryButton } from '@/components/brand';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';
import { Modal } from 'react-native';

const LOGO = require('../../assets/logo-mark.png');
const DEFAULT_TENANT = process.env.EXPO_PUBLIC_DEFAULT_TENANT_SLUG ?? 'al-haramain-ksa';

const ROLES: { id: DashboardType; label: string; emoji: string }[] = [
  { id: 'pilgrim', label: 'Traveler', emoji: '🧕' },
  { id: 'operator', label: 'Operator', emoji: '🏢' },
  { id: 'hotel', label: 'Hotel', emoji: '🏨' },
  { id: 'transport', label: 'Transport', emoji: '🚌' },
  { id: 'compliance', label: 'Visa', emoji: '📋' },
  { id: 'finance', label: 'Finance', emoji: '💰' },
  { id: 'admin', label: 'Admin', emoji: '⚡' },
];

export default function LoginScreen() {
  const router = useRouter();
  const login = useLogin();
  const demo = useLoginAsDemo();

  const [email, setEmail] = useState('admin@alharamain.sa');
  const [password, setPassword] = useState('Admin@1234');
  const [showPw, setShowPw] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  // Prefill override field with any persisted server URL
  useState(() => { getApiOverride().then((v) => v && setServerUrl(v)); });

  const handleLogin = async () => {
    if (!email.trim() || !password) return Alert.alert('Required', 'Email and password are required.');
    try {
      const user = await login.mutateAsync({ tenantSlug: DEFAULT_TENANT, email: email.trim(), password, preferredDashboard: 'operator' });
      router.replace(getDashboardPath(user.dashboardType) as any);
    } catch (err: any) {
      Alert.alert('Sign-in failed', String(err?.response?.data?.error?.message ?? err?.message ?? 'Login failed'));
    }
  };

  const handleRole = async (role: DashboardType) => {
    try {
      const user = await demo.mutateAsync(role);
      router.replace(getDashboardPath(user.dashboardType) as any);
    } catch (err: any) {
      Alert.alert('Login failed', String(err?.message ?? err));
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Brand */}
          <View style={s.hero}>
            <View style={s.logoTile}><Image source={LOGO} style={{ width: 54, height: 54 }} resizeMode="contain" /></View>
            <Text style={s.brand}>Umrah Connect</Text>
            <Text style={s.tagline}>Connected journeys</Text>
          </View>

          {/* Welcome */}
          <View style={{ gap: 4, marginBottom: spacing.sm }}>
            <Text style={s.welcome}>Welcome back</Text>
            <Text style={s.welcomeSub}>Log in to continue your Umrah journey.</Text>
          </View>

          {/* Email */}
          <View style={{ gap: spacing.md }}>
            <View>
              <Text style={s.label}>Email</Text>
              <View style={s.inputWrap}>
                <Mail color={colors.gray400} size={18} />
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                  placeholder="Email or phone" placeholderTextColor={colors.gray400} style={s.input} />
              </View>
            </View>
            {/* Password */}
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.label}>Password</Text>
                <Pressable onPress={() => Alert.alert('Reset password', 'Password reset connects to the auth backend when enabled.')}>
                  <Text style={s.forgot}>Forgot Password?</Text>
                </Pressable>
              </View>
              <View style={s.inputWrap}>
                <Lock color={colors.gray400} size={18} />
                <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw}
                  placeholder="••••••••" placeholderTextColor={colors.gray400} style={s.input} />
                <Pressable onPress={() => setShowPw(v => !v)} hitSlop={10}>
                  {showPw ? <EyeOff color={colors.gray400} size={18} /> : <Eye color={colors.gray400} size={18} />}
                </Pressable>
              </View>
            </View>

            <PrimaryButton title="Log In" loading={login.isPending} onPress={handleLogin} style={{ marginTop: 4 }} />

            {/* Continue with Google */}
            <Pressable style={s.google} onPress={() => Alert.alert('Continue with Google', 'Google sign-in connects to the auth backend when enabled.')}>
              <View style={s.gMark}><Text style={s.gG}>G</Text></View>
              <Text style={s.googleTxt}>Continue with Google</Text>
            </Pressable>

            <View style={s.signupRow}>
              <Text style={s.signupHint}>Don't have an account? </Text>
              <Pressable onPress={() => router.push('/(auth)/signup' as any)}><Text style={s.signupLink}>Sign up</Text></Pressable>
            </View>
          </View>

          {/* Explore a role (demo) */}
          <View style={s.divider}><View style={s.line} /><Text style={s.dividerTxt}>Or explore a role</Text><View style={s.line} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {ROLES.map(r => (
              <Pressable key={r.id} onPress={() => handleRole(r.id)} disabled={demo.isPending}
                style={[s.roleChip, demo.isPending && demo.variables === r.id && { opacity: 0.5 }]}>
                {demo.isPending && demo.variables === r.id
                  ? <ActivityIndicator color={colors.brand500} size="small" />
                  : <Text style={s.roleEmoji}>{r.emoji}</Text>}
                <Text style={s.roleLabel}>{r.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable onPress={() => setServerOpen(true)}>
            <Text style={s.copyright}>© 2026 Umrah Connect · Connected journeys · <Text style={{ color: colors.gold600 }}>Server</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* API server override — survives tunnel URL rotation without an APK rebuild */}
      <Modal visible={serverOpen} transparent animationType="fade" onRequestClose={() => setServerOpen(false)}>
        <View style={s.srvBackdrop}>
          <View style={s.srvCard}>
            <Text style={s.srvTitle}>API server</Text>
            <Text style={s.srvHint}>Current: {apiClient.defaults.baseURL}</Text>
            <TextInput
              value={serverUrl} onChangeText={setServerUrl}
              placeholder="https://your-api.example.com" placeholderTextColor={colors.gray400}
              autoCapitalize="none" autoCorrect={false} style={s.srvInput}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable style={[s.srvBtn, { backgroundColor: colors.gray100 }]} onPress={async () => { await setApiOverride(null); setServerUrl(''); setServerOpen(false); Alert.alert('Server reset', 'Using built-in API URL.'); }}>
                <Text style={[s.srvBtnTxt, { color: colors.gray700 }]}>Reset</Text>
              </Pressable>
              <Pressable style={[s.srvBtn, { backgroundColor: colors.brand500, flex: 1 }]} onPress={async () => {
                if (!serverUrl.trim()) return;
                await setApiOverride(serverUrl);
                setServerOpen(false);
                Alert.alert('Server updated', apiClient.defaults.baseURL ?? '');
              }}>
                <Text style={[s.srvBtnTxt, { color: colors.white }]}>Save</Text>
              </Pressable>
              <Pressable style={[s.srvBtn, { backgroundColor: colors.gray100 }]} onPress={() => setServerOpen(false)}>
                <Text style={[s.srvBtnTxt, { color: colors.gray700 }]}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray50 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  hero: { alignItems: 'center', gap: 6, marginTop: spacing.md },
  logoTile: { width: 78, height: 78, borderRadius: radius['2xl'], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  brand: { fontSize: fontSize['2xl'], fontFamily: font.heading, color: colors.brand500, marginTop: 8 },
  tagline: { fontSize: fontSize.xs, fontFamily: font.body, color: colors.gray500 },

  welcome: { fontSize: fontSize['2xl'], fontFamily: font.heading, color: colors.gray900 },
  welcomeSub: { fontSize: fontSize.sm, fontFamily: font.body, color: colors.gray500 },

  label: { fontSize: 12, fontFamily: font.bodySemi, color: colors.gray600, marginBottom: 6 },
  forgot: { fontSize: 12, fontFamily: font.bodySemi, color: colors.gold600 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200 },
  input: { flex: 1, paddingVertical: 14, fontSize: fontSize.sm, color: colors.gray900, fontFamily: font.body },

  google: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.white, paddingVertical: 13, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200 },
  gMark: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  gG: { fontFamily: font.heading, color: '#4285F4', fontSize: 13 },
  googleTxt: { fontSize: fontSize.sm, fontFamily: font.bodySemi, color: colors.gray700 },

  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  signupHint: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.body },
  signupLink: { fontSize: fontSize.sm, color: colors.brand500, fontFamily: font.bodySemi },

  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  line: { flex: 1, height: 1, backgroundColor: colors.gray200 },
  dividerTxt: { fontSize: 11, color: colors.gray400, fontFamily: font.body },
  roleChip: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200, minWidth: 72 },
  roleEmoji: { fontSize: 20 },
  roleLabel: { fontSize: 11, fontFamily: font.bodyMedium, color: colors.gray700 },

  copyright: { textAlign: 'center', fontSize: 10, color: colors.gray400, fontFamily: font.body, marginTop: spacing.sm },

  srvBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  srvCard: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 420 },
  srvTitle: { fontSize: fontSize.base, fontFamily: font.heading, color: colors.gray900 },
  srvHint: { fontSize: 11, color: colors.gray500, fontFamily: font.body, marginTop: 4, marginBottom: 10 },
  srvInput: { backgroundColor: colors.gray50, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: fontSize.sm, color: colors.gray900, fontFamily: font.body },
  srvBtn: { paddingHorizontal: spacing.md, paddingVertical: 11, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  srvBtnTxt: { fontSize: fontSize.sm, fontFamily: font.bodySemi },
});
