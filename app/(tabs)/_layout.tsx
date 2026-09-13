import { Tabs } from 'expo-router';

import { TabBar } from '../../components/layout/TabBar';
import { colors } from '../../lib/theme';

/**
 * Four tabs and one action.
 *
 * The web sidebar carries seven destinations; a tab bar carries four. Budgets
 * and Tracker live under More but are one tap from their Home cards, which is
 * how you actually arrive at them — you notice a tight budget on the
 * dashboard, then drill in.
 *
 * The bar itself is custom (components/layout/TabBar) and floats over the
 * content, so every tab screen leaves TAB_BAR_CLEARANCE at the bottom.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
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
