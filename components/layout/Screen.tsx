import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, useColors } from '../../lib/theme';
import { PressableScale } from '../ui/PressableScale';
import { BlurTarget } from './glass';

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
      <Animated.View entering={FadeInDown.duration(380)} className="px-5 pb-4 pt-3">
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
              <Text className="mb-1 text-sm" style={{ color: colors.muted, fontFamily: fonts.medium }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.bold,
                fontSize: 30,
                letterSpacing: -0.8,
                lineHeight: 36,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text className="mt-1 text-sm" style={{ color: colors.muted, fontFamily: fonts.regular }}>
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

  // A scrolling screen scrolls its title away with the content; a list screen
  // keeps it pinned above the list, which owns its own scrolling.
  if (scroll) {
    return (
      <Root style={rootStyle}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: (back ? 40 : TAB_BAR_CLEARANCE) + insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {children}
        </ScrollView>
      </Root>
    );
  }

  return (
    <Root style={rootStyle}>
      {header}
      <View className="flex-1">{children}</View>
    </Root>
  );
}
