import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  FadeIn,
  FadeOut,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  type LayoutAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/ui/PressableScale';
import { easings } from '@/lib/motion';
import { useColors, withAlpha, type Palette } from '@/lib/theme';
import type { Tone } from '../domain/wording';
import { Text } from '@/components/ui/Text';

/** The colour for a balance tone: owed to you, you owe, or neither. */
export function toneColor(tone: Tone, colors: Palette): string {
  return tone === 'good' ? colors.income : tone === 'bad' ? colors.expense : colors.muted;
}

/** A pill action under a header: "Settle up", "Balances", "Totals". */
export function ActionPill({
  icon: Icon,
  label,
  onPress,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      scaleTo={0.94}
      className="flex-row items-center gap-1.5 rounded-full px-4 py-2.5"
      style={
        primary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }
      }
    >
      <Icon size={15} color={primary ? colors.onPrimary : colors.foreground} strokeWidth={2.3} />
      <Text weight="semibold" size={13} tone={primary ? 'onPrimary' : 'default'}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** The big floating "Add expense" button at the bottom of a Groups screen. */
export function FloatingAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 18, alignItems: 'center' }}
    >
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        scaleTo={0.94}
        className="flex-row items-center gap-2 rounded-full px-6 py-4"
        style={{
          backgroundColor: colors.primary,
          shadowColor: colors.shadow,
          shadowOpacity: colors.shadowOpacity,
          shadowRadius: 12,
          elevation: 6,
        }}
      >
        <Icon size={19} color={colors.onPrimary} strokeWidth={2.5} />
        <Text weight="bold" size={15} tone="onPrimary">
          {label}
        </Text>
      </PressableScale>
    </View>
  );
}

const SHEET_IN = 320;
const SHEET_OUT = 220;

/**
 * The sheet rises exactly its own height and eases to rest. It used to spring
 * up from the bottom of the screen with a damping ratio of about 0.37 (Reanimated
 * 4's default mass is 4), overshooting by nearly a third of the screen and
 * wobbling before it settled. A timing curve can't overshoot.
 */
function sheetIn(values: EntryAnimationsValues): LayoutAnimation {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: values.targetHeight }] },
    animations: { transform: [{ translateY: withTiming(0, { duration: SHEET_IN, easing: easings.enter }) }] },
  };
}

/** Leaving: drops its own height, quickening as it goes. */
function sheetOut(values: ExitAnimationsValues): LayoutAnimation {
  'worklet';
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [{ translateY: withTiming(values.currentHeight, { duration: SHEET_OUT, easing: easings.exit }) }],
    },
  };
}

/**
 * A bottom sheet that lives INSIDE a form screen, so a draft never crosses
 * routes: the paid-by and split editors open over the expense form and edit
 * its state directly. Android back closes the sheet, not the form — one of the
 * three meanings of "back" CLAUDE.md warns must not fight.
 */
export function FormSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View
        entering={FadeIn.duration(SHEET_IN).easing(easings.enter)}
        exiting={FadeOut.duration(SHEET_OUT).easing(easings.exit)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: withAlpha(colors.shadow, 0.45) }}
        />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
        <Animated.View
          entering={sheetIn}
          exiting={sheetOut}
          style={{
            maxHeight: '88%',
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View className="items-center pt-2.5">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-3">
            <Text weight="bold" size={18} tone="default">
              {title}
            </Text>
            <PressableScale
              accessibilityRole="button"
              onPress={onClose}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: colors.primary }}
            >
              <Text weight="semibold" size={14} tone="onPrimary">
                Done
              </Text>
            </PressableScale>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
          >
            {children}
          </ScrollView>
          {footer ? <View className="px-5 pt-2">{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
