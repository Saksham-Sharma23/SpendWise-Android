import { useRouter, type Tabs } from 'expo-router';
import { ChartColumn, House, LayoutGrid, Plus, Receipt, type LucideIcon } from 'lucide-react-native';
import { useEffect, type ComponentProps } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, springs } from '../../lib/theme';
import { PressableScale } from '../ui/PressableScale';

// expo-router vendors react-navigation and does not re-export the tab bar
// prop type, so derive it from the Tabs component itself.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  index: { icon: House, label: 'Home' },
  transactions: { icon: Receipt, label: 'Activity' },
  insights: { icon: ChartColumn, label: 'Insights' },
  more: { icon: LayoutGrid, label: 'More' },
};

/**
 * A floating tab bar: four destinations and one action.
 *
 * The active tab grows a lime-tinted pill with its label; inactive tabs are
 * icon-only, which keeps the bar calm. The centre button is not a tab — it
 * opens the add form and dismisses back to wherever you were.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { bottom } = useSafeAreaInsets();
  const routes = state.routes.filter((r) => r.name !== 'add');
  const activeName = state.routes[state.index]?.name;

  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = ICONS[route.name];
    if (!meta) return null;
    const focused = route.name === activeName;
    return (
      <Tab
        key={route.key}
        icon={meta.icon}
        label={meta.label}
        focused={focused}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
      />
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: bottom + 10 }}
    >
      <View
        className="mx-4 flex-row items-center rounded-full border px-2"
        style={{
          height: 68,
          backgroundColor: 'rgba(21, 22, 25, 0.97)',
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
        }}
      >
        <View className="flex-1 flex-row items-center justify-around">{left.map(renderTab)}</View>
        <AddButton />
        <View className="flex-1 flex-row items-center justify-around">{right.map(renderTab)}</View>
      </View>
    </View>
  );
}

function Tab({
  icon: Icon,
  label,
  focused,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [focused, progress]);

  // interpolateColor, not a template string: near the end of a timing curve
  // the alpha becomes e.g. 2.1e-7, and Reanimated rejects exponent notation.
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(212,245,94,0)', 'rgba(212,245,94,0.12)']),
    borderColor: interpolateColor(progress.value, [0, 1], ['rgba(212,245,94,0)', 'rgba(212,245,94,0.3)']),
    paddingHorizontal: interpolate(progress.value, [0, 1], [12, 14]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    maxWidth: interpolate(progress.value, [0, 1], [0, 80]),
    marginLeft: interpolate(progress.value, [0, 1], [0, 6]),
  }));

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={6}
    >
      <Animated.View
        className="flex-row items-center rounded-full border"
        style={[{ height: 42 }, pill]}
      >
        <Icon size={20} color={focused ? colors.primary : colors.muted} strokeWidth={focused ? 2.3 : 2} />
        <Animated.View style={[{ overflow: 'hidden' }, labelStyle]}>
          <Text numberOfLines={1} style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 }}>
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </PressableScale>
  );
}

function AddButton() {
  const router = useRouter();
  const turn = useSharedValue(0);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 90}deg` }] }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      accessibilityHint="Opens the add transaction form. Long press to import a spreadsheet."
      scaleTo={0.86}
      onPressIn={() => {
        turn.value = withSpring(1, springs.press);
      }}
      onPressOut={() => {
        turn.value = withSpring(0, springs.settle);
      }}
      onPress={() => router.push('/(modals)/transaction')}
      onLongPress={() => router.push('/import/pick')}
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        marginHorizontal: 6,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        // No coloured shadow: Android renders it as a blurry lime halo that
        // leaks into the bar. A dark ring separates the button instead.
        borderWidth: 3,
        borderColor: colors.background,
      }}
    >
      <Animated.View style={spin}>
        <Plus size={26} color={colors.onPrimary} strokeWidth={2.6} />
      </Animated.View>
    </PressableScale>
  );
}
