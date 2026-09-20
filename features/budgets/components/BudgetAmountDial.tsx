import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AmountDial } from '@/components/ui/AmountDial';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatINR, paiseToDecimalString, parseAmountToPaise } from '@/lib/money';
import { colors, useColors, withAlpha } from '@/lib/theme';
import { appear } from '@/lib/motion';
import { DIAL_SCALES, presetsFor, rescale, scaleFor, turnsOf, type DialScale } from '../domain/dial';
import { Text, font } from '@/components/ui/Text';

/**
 * The budget amount, set the way an alarm is set.
 *
 * The dial owns the gesture; this owns the decisions around it — which scale
 * is in force, what the presets are, and the keypad fallback for an exact
 * figure. The value lives in the FORM as a decimal string (so the existing
 * zod schema and `toBudgetInput` are untouched); paise is the currency
 * between them.
 */

interface Props {
  /** The form's string value, e.g. '7500.00'. */
  value: string;
  onChange: (value: string) => void;
  /** Focus the keypad as soon as the screen opens (new budgets only). */
  autoFocusKeypad?: boolean;
}

export function BudgetAmountDial({ value, onChange, autoFocusKeypad = false }: Props) {
  const colors = useColors();
  const paise = parseAmountToPaise(value) ?? 0;

  // Start on a scale that can show the value in one turn — editing a ₹40,000
  // budget on the ₹10k dial would open it wound four times round.
  const [scale, setScale] = useState<DialScale>(() => scaleFor(paise));
  const [typing, setTyping] = useState(autoFocusKeypad);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!typing) setDraft(value);
  }, [value, typing]);

  const setPaise = (next: number) => onChange(paiseToDecimalString(next));

  const commitTyped = () => {
    const parsed = parseAmountToPaise(draft);
    setTyping(false);
    if (parsed == null) {
      // Leave what they typed for zod to object to, rather than silently
      // discarding it.
      onChange(draft);
      return;
    }
    onChange(paiseToDecimalString(parsed));
    // Follow the typed figure onto a dial that can show it.
    setScale(scaleFor(parsed));
  };

  const turns = turnsOf(paise, scale);

  return (
    <View className="items-center">
      <Text variant="body" tone="muted">
        How much per cycle?
      </Text>

      <View className="mt-4">
        <AmountDial
          valuePaise={paise}
          onChange={setPaise}
          maxPaise={scale.maxPaise}
          stepPaise={scale.stepPaise}
          size={264}
          turns={turns}
          label="Budget amount"
          onPressCenter={() => {
            setDraft(paise > 0 ? paiseToDecimalString(paise) : '');
            setTyping(true);
          }}
        >
          {typing ? (
            <View className="flex-row items-center justify-center">
              <Text weight="semibold" size={26} tone="primary" style={{ marginRight: 2 }}>
                ₹
              </Text>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onBlur={commitTyped}
                onSubmitEditing={commitTyped}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder="0"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.primary}
                style={{
                  color: colors.foreground,
                  ...font('bold', 34),
                  letterSpacing: -1,
                  minWidth: 90,
                  paddingVertical: 0,
                  textAlign: 'center',
                  fontVariant: ['tabular-nums'],
                }}
              />
            </View>
          ) : (
            <Animated.Text
              entering={appear()}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: colors.foreground,
                ...font('bold', 34),
                letterSpacing: -1,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatINR(paise, { whole: true })}
            </Animated.Text>
          )}
        </AmountDial>
      </View>

      {typing ? (
        <PressableScale
          accessibilityRole="button"
          onPress={commitTyped}
          className="mt-3 flex-row items-center gap-2 rounded-full px-4 py-2"
          style={{ backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primaryBorder }}
        >
          <Check size={14} color={colors.primary} />
          <Text weight="semibold" size={13} tone="primary">
            Done
          </Text>
        </PressableScale>
      ) : (
        <>
          {/* Scale: what one full turn is worth. */}
          <View className="mt-4 flex-row items-center gap-2">
            <Text weight="medium" size={11} tone="subtle">
              One turn
            </Text>
            {DIAL_SCALES.map((s) => {
              const on = s.maxPaise === scale.maxPaise;
              return (
                <PressableScale
                  key={s.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`One turn is ${s.label}`}
                  onPress={() => {
                    setScale(s);
                    // Keep the AMOUNT, re-round it to the new notch. Keeping
                    // the angle instead would multiply the budget by ten.
                    setPaise(rescale(paise, s));
                  }}
                  scaleTo={0.92}
                  className="rounded-full border px-3 py-1"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : 'transparent',
                  }}
                >
                  <Text weight="semibold" size={12} tone={on ? 'primary' : 'muted'}>
                    {s.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <View className="mt-3 flex-row flex-wrap justify-center gap-2">
            {presetsFor(scale).map((p) => {
              const on = p === paise;
              return (
                <PressableScale
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPaise(p)}
                  scaleTo={0.93}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.card,
                  }}
                >
                  <Text variant="small" tone={on ? 'primary' : 'muted'} style={{ fontVariant: ['tabular-nums'] }}>
                    {formatINR(p, { whole: true })}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <Text weight="regular" size={11} tone="subtle" className="mt-3">
            Drag around the dial · each notch is {formatINR(scale.stepPaise, { whole: true })}
          </Text>
        </>
      )}
    </View>
  );
}

/** The soft tint used for the dial's glow, exported for the editor's header. */
export const dialGlow = withAlpha(colors.primary, 0.1);
