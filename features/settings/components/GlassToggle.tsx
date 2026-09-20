import { Layers, Square } from 'lucide-react-native';
import { View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PressableScale } from '@/components/ui/PressableScale';
import { Text } from '@/components/ui/Text';
import { useGlassStore, type GlassPreference } from '@/lib/glassStore';
import { useColors, withAlpha } from '@/lib/theme';

/**
 * Glass or solid tab bar.
 *
 * The honest reason this is a setting and not a decision: whether glass stays
 * readable depends on what is behind it. Over a dense ledger, or on a phone
 * whose owner simply prefers flat surfaces, the solid capsule is the better
 * answer — and that is not a judgement to make on someone else's behalf.
 */

const OPTIONS: { value: GlassPreference; label: string; hint: string; icon: typeof Layers }[] = [
  { value: 'glass', label: 'Glass', hint: 'See through, lensed edge', icon: Layers },
  { value: 'solid', label: 'Solid', hint: 'Denser, flat surface', icon: Square },
];

export function GlassToggle() {
  const preference = useGlassStore((s) => s.preference);
  const setPreference = useGlassStore((s) => s.setPreference);

  return (
    <View className="gap-3">
      <Text variant="label" tone="muted">
        Tab bar
      </Text>

      <Card className="p-3">
        <View className="flex-row gap-3">
          {OPTIONS.map((o) => (
            <Choice key={o.value} option={o} selected={preference === o.value} onPress={() => setPreference(o.value)} />
          ))}
        </View>
      </Card>

      <Text variant="caption" tone="subtle">
        {preference === 'glass'
          ? 'The bar lets the screen through, with the light gathered at its edge.'
          : 'A solid bar, for the most contrast behind the labels.'}
      </Text>
    </View>
  );
}

function Choice({
  option,
  selected,
  onPress,
}: {
  option: (typeof OPTIONS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const Icon = option.icon;

  return (
    <PressableScale onPress={onPress} className="flex-1" accessibilityRole="radio" accessibilityState={{ selected }}>
      <View
        className="items-center gap-2 rounded-2xl p-3"
        style={{
          backgroundColor: selected ? withAlpha(colors.primary, 0.12) : colors.elevated,
          borderWidth: 1,
          borderColor: selected ? withAlpha(colors.primary, 0.36) : 'transparent',
        }}
      >
        <Icon size={20} color={selected ? colors.primary : colors.muted} />
        <Text weight="semibold" size={13} tone={selected ? 'default' : 'muted'}>
          {option.label}
        </Text>
        <Text variant="caption" tone="subtle" style={{ textAlign: 'center' }}>
          {option.hint}
        </Text>
      </View>
    </PressableScale>
  );
}
