import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { PressableScale } from '../ui/PressableScale';
import { BlurTarget, ScrollEdgeFade, useGlassScrollHandler } from './glass';
import { Text } from '@/components/ui/Text';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Small line above the title, e.g. a greeting or a step counter. */
  eyebrow?: string;
  children: ReactNode;
  /** Set false when the child manages its own scrolling (e.g. a FlashList). */
  scroll?: boolean;
  right?: ReactNode;
  /** Show a back button. Use on stack screens, never on tabs. */
  back?: boolean;
}

/** Room for the floating tab bar, so the last card is never hidden under it. */
export const TAB_BAR_CLEARANCE = 120;

/**
 * The standard screen shell: safe-area padding, a large title block and a
 * consistent 20pt gutter. Every screen uses it so spacing is set in one place.
 */
export function Screen({ title, subtitle, eyebrow, children, scroll = true, right, back = false }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const header =
    title != null ? (
      <Animated.View entering={rise()} className="px-5 pb-4 pt-3">
        {back ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            scaleTo={0.9}
            className="mb-4 h-10 w-10 items-center justify-center rounded-full border"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <ChevronLeft size={20} color={colors.foreground} />
          </PressableScale>
        ) : null}
        <View className="flex-row items-end justify-between">
          <View className="flex-1 pr-3">
            {eyebrow ? (
              <Text weight="medium" tone="muted" className="mb-1 text-sm">
                {eyebrow}
              </Text>
            ) : null}
            <Text variant="title" tone="default" style={{ letterSpacing: -0.8, lineHeight: 36 }}>
              {title}
            </Text>
            {subtitle ? (
              <Text weight="regular" tone="muted" className="mt-1 text-sm">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      </Animated.View>
    ) : null;

  // Tab screens sit under the glass tab bar, so they are its blur target.
  // Stack screens (back=true) have no bar over them.
  const Root = back ? View : BlurTarget;
  const rootStyle = { flex: 1, paddingTop: insets.top, backgroundColor: colors.background };
  // Last inside the blur target, over the content: see ScrollEdgeFade. It
  // draws nothing unless the bar is liquid glass.
  const edgeFade = back ? null : <ScrollEdgeFade height={TAB_BAR_CLEARANCE + insets.bottom} />;
  // Liquid glass drifts its glare with the scroll under it. Only when this
  // screen owns that scroll: a tab (a stack screen has no bar) that scrolls
  // itself (a list screen's list reports its own). Undefined when frosted.
  const glassScroll = useGlassScrollHandler(scroll && !back);

  // A scrolling screen scrolls its title away with the content; a list screen
  // keeps it pinned above the list, which owns its own scrolling.
  if (scroll) {
    return (
      <Root style={rootStyle}>
        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: (back ? 40 : TAB_BAR_CLEARANCE) + insets.bottom }}
          showsVerticalScrollIndicator={false}
          onScroll={glassScroll}
          scrollEventThrottle={16}
        >
          {header}
          {children}
        </Animated.ScrollView>
        {edgeFade}
      </Root>
    );
  }

  return (
    <Root style={rootStyle}>
      {header}
      <View className="flex-1">{children}</View>
      {edgeFade}
    </Root>
  );
}
