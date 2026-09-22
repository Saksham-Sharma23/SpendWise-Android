import { Tabs } from 'expo-router';
import { Easing } from 'react-native';

import { TabBar } from '@/components/layout/TabBar';
import { curves, useColors } from '@/lib/theme';

/**
 * Switching tabs dissolves one screen into the next instead of cutting.
 *
 * The bottom tabs run this on React Native's `Animated` with the native
 * driver, so a busy JS thread cannot stall it. 180 ms on the app's own
 * `standard` curve, not the library's 150 ms linear: just long enough to read
 * as a dissolve, over well before the droplet (320/380 ms) lands.
 */
const TAB_FADE = {
  animation: 'fade',
  transitionSpec: { animation: 'timing', config: { duration: 180, easing: Easing.bezier(...curves.standard) } },
} as const;

/**
 * Four tabs and one action.
 *
 * The web sidebar carries seven destinations; a tab bar carries four. Budgets
 * and Tracker live under More but are one tap from their Home cards, which is
 * how you actually arrive at them — you notice a tight budget on the
 * dashboard, then drill in.
 *
 * The bar itself is custom (components/layout/TabBar) and floats over the
 * content, so every tab screen leaves TAB_BAR_CLEARANCE at the bottom. It also
 * builds the other tabs in the background after launch, so the first visit to
 * one is only the fade, not the screen assembling itself.
 */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        ...TAB_FADE,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      {/* The centre slot is an action, not a destination — TabBar skips it. */}
      <Tabs.Screen name="add" options={{ title: '' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
