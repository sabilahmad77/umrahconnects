import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, RefreshCcw } from 'lucide-react-native';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

/**
 * Top-level error boundary. Catches any render-time crash from descendant
 * screens and shows a recoverable UI with the actual error message + a Retry
 * button, instead of letting the native Android process crash.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    // Log to JS console so it shows up in `adb logcat | grep ReactNativeJS`
    // and Metro terminal during dev.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught render error:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.gray50 }} contentContainerStyle={s.wrap}>
        <View style={s.iconWrap}>
          <AlertTriangle color={colors.red600} size={28} />
        </View>
        <Text style={s.title}>Something went wrong on this screen</Text>
        <Text style={s.body}>
          The app caught the error and stayed open. Tap Retry to reload — and if it keeps happening,
          please share the message below.
        </Text>

        <View style={s.errBox}>
          <Text style={s.errText} selectable>
            {String(this.state.error?.message ?? this.state.error)}
          </Text>
        </View>

        <TouchableOpacity onPress={this.reset} style={s.btn} activeOpacity={0.85}>
          <RefreshCcw color={colors.white} size={16} />
          <Text style={s.btnText}>Retry</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

const s = StyleSheet.create({
  wrap: { padding: spacing.xl, gap: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: '100%' as any },
  iconWrap: {
    width: 56, height: 56, borderRadius: radius.full,
    backgroundColor: colors.red50, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray900, textAlign: 'center' },
  body: { fontSize: fontSize.sm, color: colors.gray600, textAlign: 'center', maxWidth: 320 },
  errBox: {
    backgroundColor: colors.gray100, borderRadius: radius.lg,
    padding: spacing.md, marginTop: spacing.sm, width: '100%',
  },
  errText: { fontSize: 11, color: colors.gray700, fontFamily: 'Menlo' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brand500, paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.xl, marginTop: spacing.md,
  },
  btnText: { color: colors.white, fontSize: fontSize.base, fontWeight: '700' },
});
