import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { cloneElement, useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text as RNText, TextInput as RNTextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-url-polyfill/auto';
import {
  useFonts,
  Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useAuthStore } from '@/lib/auth-store';
import { getDashboardPath } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ── Global brand typography ──────────────────────────────────────────────────
// Every <Text>/<TextInput> renders in Inter (correct weight) unless it explicitly
// opts into another family (e.g. Manrope headings). This applies the brand font
// across the entire app without editing every screen.
const interForWeight = (w?: string | number) => {
  switch (String(w)) {
    case '500': return 'Inter_500Medium';
    case '600': return 'Inter_600SemiBold';
    case '700':
    case '800':
    case '900':
    case 'bold': return 'Inter_700Bold';
    default: return 'Inter_400Regular';
  }
};
function installGlobalFont(Comp: any) {
  if (Comp.__brandFont) return;
  const orig = Comp.render;
  Comp.render = function (...args: any[]) {
    const el = orig.apply(this, args);
    const flat = StyleSheet.flatten(el.props.style) || {};
    if (flat.fontFamily) return el; // respect explicit families (Manrope, etc.)
    return cloneElement(el, {
      style: [{ fontFamily: interForWeight((flat as any).fontWeight) }, el.props.style],
    });
  };
  Comp.__brandFont = true;
}
installGlobalFont(RNText);
installGlobalFont(RNTextInput);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Keep data fresh for 60s so navigating between tabs doesn't re-fetch
      staleTime: 60_000,
      // Don't auto-refetch on window focus — phones get backgrounded often
      refetchOnWindowFocus: false,
      // Don't auto-refetch when the network reconnects mid-session — the user
      // can pull-to-refresh if they want fresh data.
      refetchOnReconnect: false,
      // Show cached data while refetching in the background instead of resetting
      placeholderData: (prev: any) => prev,
    },
    mutations: { retry: 0 },
  },
});

import { initApiBaseURL } from '@/lib/api';

function AuthGate({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const router = useRouter();
  const isReady = useAuthStore((s) => s.isReady);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => { initApiBaseURL().finally(() => hydrate()); }, [hydrate]);

  const signedIn = !!user && !!token;

  useEffect(() => {
    if (!isReady) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!signedIn && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (signedIn && inAuthGroup && user) {
      // Route to the user's role-appropriate landing instead of always /(tabs)
      const path = getDashboardPath(user.dashboardType);
      router.replace(path as any);
    }
  }, [isReady, signedIn, segments, router, user]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }}>
        <ActivityIndicator color={colors.brand500} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    IBMPlexSansArabic_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand500 }}>
        <ActivityIndicator color={colors.gold500} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <AuthGate>
            <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.brand500 },
              headerTintColor: colors.white,
              headerTitleStyle: { fontFamily: 'Manrope_700Bold', color: colors.white },
              headerShadowVisible: false,
            }}
          >
              <Stack.Screen name="(auth)"          options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)"          options={{ headerShown: false }} />
              {/* Screens that render their own GreenHeader — hide the stack header */}
              <Stack.Screen name="social"          options={{ headerShown: false }} />
              <Stack.Screen name="messages"        options={{ headerShown: false }} />
              <Stack.Screen name="booking-confirm" options={{ headerShown: false }} />
              <Stack.Screen name="booking-success" options={{ headerShown: false }} />
              {/* Screens using the default green stack header */}
              <Stack.Screen name="hotels"      options={{ title: 'Hotels' }} />
              <Stack.Screen name="transport"   options={{ title: 'Transport' }} />
              <Stack.Screen name="groups"      options={{ title: 'Trip Groups' }} />
              <Stack.Screen name="compliance"  options={{ title: 'Visa & Compliance' }} />
              <Stack.Screen name="reports"     options={{ title: 'Reports & Analytics' }} />
              <Stack.Screen name="settings"    options={{ title: 'Settings' }} />
            </Stack>
          </AuthGate>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
