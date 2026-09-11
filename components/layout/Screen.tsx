import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Set false when the child manages its own scrolling (e.g. a FlashList). */
  scroll?: boolean;
  right?: ReactNode;
}

/**
 * The standard screen shell: safe-area padding, an optional title block, and
 * a consistent horizontal gutter. Every screen uses this so spacing is set
 * in one place rather than drifting per-screen.
 */
export function Screen({ title, subtitle, children, scroll = true, right }: ScreenProps) {
  const insets = useSafeAreaInsets();

  const header =
    title != null ? (
      <View className="flex-row items-start justify-between px-5 pb-3 pt-2">
        <View className="flex-1 pr-3">
          <Text
            className="text-2xl text-foreground"
            style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-sm text-muted-foreground">{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    ) : null;

  const body = scroll ? (
    <ScrollView
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1">{children}</View>
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {header}
      {body}
    </View>
  );
}
