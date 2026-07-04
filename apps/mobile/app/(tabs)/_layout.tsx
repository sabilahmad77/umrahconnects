import { Tabs, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Bell, Home, Plus, ShoppingBag, User } from 'lucide-react-native';
import { useAuthStore } from '@/lib/auth-store';
import { colors, shadow } from '@/lib/theme';

// Center "+" action button — opens a quick-create sheet routed to existing flows
function CenterButton() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const onPress = () => {
    const isTraveler = user?.dashboardType === 'pilgrim';
    const options: { text: string; onPress?: () => void; style?: any }[] = [
      { text: 'Share a post', onPress: () => router.push('/social' as any) },
      { text: 'Post a marketplace request', onPress: () => router.push('/(tabs)/market' as any) },
    ];
    if (!isTraveler) {
      options.push({ text: 'New booking', onPress: () => router.push('/bookings' as any) });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Create', 'What would you like to do?', options as any);
  };
  return (
    <View style={s.centerWrap} pointerEvents="box-none">
      <Pressable style={s.center} onPress={onPress}>
        <Plus color={colors.white} size={26} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand500,
        tabBarInactiveTintColor: colors.gray400,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.gray100,
          height: 84,
          paddingBottom: 24,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="market"
        options={{ title: 'Marketplace', tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarButton: () => <CenterButton />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{ title: 'Alerts', tabBarIcon: ({ color, size }) => <Bell color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />

      {/* Hidden routes still reachable via navigation from Home/Profile */}
      <Tabs.Screen name="pilgrims" options={{ href: null }} />
      <Tabs.Screen name="bookings" options={{ href: null }} />
      <Tabs.Screen name="finance" options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: colors.brand500,
    alignItems: 'center', justifyContent: 'center', marginTop: -22,
    borderWidth: 4, borderColor: colors.white, ...shadow.raised,
  },
});
