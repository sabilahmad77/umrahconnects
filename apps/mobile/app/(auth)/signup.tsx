import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react-native';
import { apiClient } from '@/lib/api';
import { PrimaryButton } from '@/components/brand';
import { colors, font, fontSize, radius, spacing, shadow } from '@/lib/theme';

const LOGO = require('../../assets/logo-mark.png');

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      return Alert.alert('Required', 'Name, email and password are required.');
    }
    setBusy(true);
    try {
      // Attempt self-serve traveler registration (backend endpoint: POST /auth/register)
      await apiClient.post('/auth/register', {
        email: email.trim(), password, phone: phone.trim() || undefined,
        displayName: fullName.trim(), accountType: 'TRAVELER',
      });
      Alert.alert('Account created', 'You can now sign in.', [{ text: 'OK', onPress: () => router.replace('/(auth)/login' as any) }]);
    } catch (e: any) {
      // Frontend-first: registration backend may require tenant onboarding — guide the user
      Alert.alert(
        'Sign up',
        'Self-serve sign-up will be enabled with the onboarding backend. For now, use “Explore a role” on the login screen to try the platform.',
        [{ text: 'Back to login', onPress: () => router.replace('/(auth)/login' as any) }],
      );
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={s.logoTile}><Image source={LOGO} style={{ width: 48, height: 48 }} resizeMode="contain" /></View>
            <Text style={s.brand}>Create your account</Text>
            <Text style={s.tagline}>Join the connected Umrah ecosystem</Text>
          </View>

          <View style={{ gap: spacing.md }}>
            <Field label="Full name" icon={<User color={colors.gray400} size={18} />} value={fullName} onChangeText={setFullName} placeholder="Ahmad Khan" />
            <Field label="Email" icon={<Mail color={colors.gray400} size={18} />} value={email} onChangeText={setEmail} placeholder="you@email.com" autoCapitalize="none" keyboardType="email-address" />
            <Field label="Phone (optional)" icon={<Phone color={colors.gray400} size={18} />} value={phone} onChangeText={setPhone} placeholder="+966 5x xxx xxxx" keyboardType="phone-pad" />
            <View>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrap}>
                <Lock color={colors.gray400} size={18} />
                <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPw} placeholder="Create a password" placeholderTextColor={colors.gray400} style={s.input} />
                <Pressable onPress={() => setShowPw(v => !v)} hitSlop={10}>
                  {showPw ? <EyeOff color={colors.gray400} size={18} /> : <Eye color={colors.gray400} size={18} />}
                </Pressable>
              </View>
            </View>

            <PrimaryButton title="Create account" loading={busy} onPress={submit} style={{ marginTop: 4 }} />

            <View style={s.row}>
              <Text style={s.hint}>Already have an account? </Text>
              <Pressable onPress={() => router.replace('/(auth)/login' as any)}><Text style={s.link}>Log in</Text></Pressable>
            </View>
          </View>

          <Text style={s.copyright}>© 2026 Umrah Connect · Connected journeys</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, ...rest }: any) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputWrap}>{icon}<TextInput {...rest} placeholderTextColor={colors.gray400} style={s.input} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray50 },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  hero: { alignItems: 'center', gap: 6, marginTop: spacing.md },
  logoTile: { width: 70, height: 70, borderRadius: radius['2xl'], backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.gray100, ...shadow.card },
  brand: { fontSize: fontSize.xl, fontFamily: font.heading, color: colors.gray900, marginTop: 8 },
  tagline: { fontSize: fontSize.xs, fontFamily: font.body, color: colors.gray500 },
  label: { fontSize: 12, fontFamily: font.bodySemi, color: colors.gray600, marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.gray200 },
  input: { flex: 1, paddingVertical: 14, fontSize: fontSize.sm, color: colors.gray900, fontFamily: font.body },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  hint: { fontSize: fontSize.sm, color: colors.gray500, fontFamily: font.body },
  link: { fontSize: fontSize.sm, color: colors.brand500, fontFamily: font.bodySemi },
  copyright: { textAlign: 'center', fontSize: 10, color: colors.gray400, fontFamily: font.body, marginTop: spacing.sm },
});
