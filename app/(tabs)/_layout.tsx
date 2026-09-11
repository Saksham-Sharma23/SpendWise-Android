import { Tabs, useRouter } from 'expo-router';
import { BarChart3, Grid3x3, House, Plus, Receipt } from 'lucide-react-native';
import { Pressable, View, useColorScheme } from 'react-native';

/**
 * Four tabs and one action.
 *
 * The web sidebar carries seven destinations; a tab bar carries four. Budgets
 * and Tracker live under More but are one tap from their Home cards, which is
 * how you actually arrive at them — you notice a tight budget on the
 * dashboard, then drill in.
 *
 * The centre button is NOT a tab. Adding a transaction is the app's most
 * frequent action and it is an action, not a place: it opens a modal that
 * dismisses back to wherever you were.
 */

const ACTIVE_LIGHT = '#0B5C4B';
const ACTIVE_DARK = '#5FC9A9';
const INACTIVE_LIGHT = '#7C8981';
const INACTIVE_DARK = '#78877F';

function AddButton() {
  const router = useRouter();
  const scheme = useColorScheme();
  const bg = scheme === 'dark' ? ACTIVE_DARK : ACTIVE_LIGHT;
  const fg = scheme === 'dark' ? '#08201A' : '#FFFFFF';

  return (
    <View className="flex-1 items-center justify-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        accessibilityHint="Opens the add transaction form. Long press to import a spreadsheet."
        onPress={() => router.push('/(modals)/transaction')}
        onLongPress={() => router.push('/import/pick')}
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -18,
        }}
      >
        <Plus size={26} color={fg} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? ACTIVE_DARK : ACTIVE_LIGHT,
        tabBarInactiveTintColor: isDark ? INACTIVE_DARK : INACTIVE_LIGHT,
        tabBarStyle: {
          backgroundColor: isDark ? '#141B18' : '#FFFFFF',
          borderTopColor: isDark ? '#28322D' : '#D3DAD5',
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'PlusJakartaSans_500Medium',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <House size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <Receipt size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: '',
          tabBarButton: () => <AddButton />,
        }}
        listeners={{
          // The centre slot is an action, not a destination.
          tabPress: (e) => e.preventDefault(),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Grid3x3 size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
