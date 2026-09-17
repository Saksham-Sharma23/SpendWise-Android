import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  WEEKDAY_INITIALS,
  clampDate,
  inMonth,
  monthGrid,
  monthRange,
  openingMonth,
} from '../../lib/calendar';
import { MONTHS_SHORT, formatDayMonth, type ISODate } from '../../lib/dates';
import { useMotion } from '../../lib/motion';
import { fonts, useColors, withAlpha } from '../../lib/theme';
import { PressableScale } from './PressableScale';

interface Props {
  visible: boolean;
  /** The date the picker opens on and highlights. */
  value: ISODate;
  /** Today, from `useToday()` — highlighted, and the default bounds' anchor. */
  today: ISODate;
  /** Earliest selectable date. Default: five years before today. */
  min?: ISODate;
  /** Latest selectable date. Default: one year after today. */
  max?: ISODate;
  title?: string;
  onSelect: (date: ISODate) => void;
  onClose: () => void;
}

const MONTH_CHIP = 78;

/**
 * A calendar for picking one date.
 *
 * Built in JS on purpose (see lib/calendar.ts): no native picker module, so
 * this ships over the air, and it is painted in the app's own theme rather
 * than the system one.
 *
 * The month strip along the top is the point. With only ‹ › arrows, backdating
 * a bill by three months took about ninety taps (TASKS2 [U1]); here it is
 * open · month · day — three taps to any date in the strip, which spans five
 * years back.
 */
export function DatePickerSheet({ visible, value, today, min, max, title = 'Pick a date', onSelect, onClose }: Props) {
  const colors = useColors();
  const motion = useMotion();
  const insets = useSafeAreaInsets();

  // Whole years, so the bounds are always real dates (29 Feb five years ago
  // is not) and the strip starts in January.
  const lower = min ?? `${Number(today.slice(0, 4)) - 5}-01-01`;
  const upper = max ?? `${Number(today.slice(0, 4)) + 1}-12-31`;
  const months = useMemo(() => monthRange(lower.slice(0, 7), upper.slice(0, 7)), [lower, upper]);

  const [month, setMonth] = useState(() => openingMonth(value, lower.slice(0, 7), upper.slice(0, 7)));
  const strip = useRef<ScrollView>(null);

  // Reopening after the value changed elsewhere (the ± arrows, a chip) should
  // show that month, not wherever the user browsed to last time.
  useEffect(() => {
    if (visible) setMonth(openingMonth(value, lower.slice(0, 7), upper.slice(0, 7)));
  }, [visible, value, lower, upper]);

  // Keep the chosen month on screen without animating a long strip on open.
  useEffect(() => {
    if (!visible) return;
    const i = months.indexOf(month);
    if (i < 0) return;
    strip.current?.scrollTo({ x: Math.max(0, (i - 1) * MONTH_CHIP), animated: false });
  }, [visible, month, months]);

  const days = useMemo(() => monthGrid(month), [month]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(motion.base)} exiting={FadeOut.duration(motion.quick)} style={{ flex: 1 }}>
        {/* Tapping the scrim dismisses, like every other sheet in the app. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close the date picker"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: withAlpha(colors.background, 0.72) }}
        />
        <Animated.View
          entering={FadeInDown.duration(motion.swap)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: insets.bottom + 14,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
          }}
        >
          <View className="flex-row items-center justify-between px-5 pb-3 pt-5">
            <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>{title}</Text>
            <PressableScale
              accessibilityRole="button"
              onPress={() => onSelect(clampDate(today, lower, upper))}
              className="rounded-full border px-3 py-1.5"
              style={{ borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft }}
            >
              <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 12 }}>Today</Text>
            </PressableScale>
          </View>

          <ScrollView
            ref={strip}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 12 }}
          >
            {months.map((m) => {
              const on = m === month;
              return (
                <PressableScale
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`}
                  onPress={() => setMonth(m)}
                  scaleTo={0.94}
                  className="items-center rounded-2xl border px-3 py-2"
                  style={{
                    width: MONTH_CHIP - 8,
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.elevated,
                  }}
                >
                  <Text style={{ color: on ? colors.primary : colors.foreground, fontFamily: fonts.semibold, fontSize: 13 }}>
                    {MONTHS_SHORT[Number(m.slice(5, 7)) - 1]}
                  </Text>
                  <Text style={{ color: on ? colors.primary : colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>
                    {m.slice(0, 4)}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <View className="flex-row px-4">
            {WEEKDAY_INITIALS.map((d, i) => (
              <Text
                key={`${d}${i}`}
                style={{ flex: 1, textAlign: 'center', color: colors.subtle, fontFamily: fonts.medium, fontSize: 11 }}
              >
                {d}
              </Text>
            ))}
          </View>

          <View className="flex-row flex-wrap px-4 pt-1">
            {days.map((d) => (
              <Day
                key={d}
                date={d}
                muted={!inMonth(d, month)}
                selected={d === value}
                isToday={d === today}
                disabled={d < lower || d > upper}
                onPress={() => onSelect(d)}
              />
            ))}
          </View>

          <Text
            className="px-5 pt-3"
            style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12 }}
          >
            {value === today ? 'Today' : formatDayMonth(value)} {value === today ? '' : value.slice(0, 4)}
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Day({
  date,
  muted,
  selected,
  isToday,
  disabled,
  onPress,
}: {
  date: ISODate;
  muted: boolean;
  selected: boolean;
  isToday: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const day = Number(date.slice(8, 10));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${day} ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.88}
      style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: 38,
          height: 38,
          backgroundColor: selected ? colors.primary : isToday ? colors.elevated : 'transparent',
          borderWidth: isToday && !selected ? 1 : 0,
          borderColor: colors.primaryBorder,
        }}
      >
        <Text
          style={{
            color: selected ? colors.onPrimary : muted ? colors.subtle : colors.foreground,
            fontFamily: selected || isToday ? fonts.semibold : fonts.regular,
            fontSize: 14,
            opacity: disabled ? 0.3 : 1,
          }}
        >
          {day}
        </Text>
      </View>
    </PressableScale>
  );
}
