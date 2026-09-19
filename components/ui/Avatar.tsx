import { Text, View } from 'react-native';

import { initials } from '@/lib/identity';
import { fonts, useColors, withAlpha } from '@/lib/theme';
import { colorForName } from '@/lib/categoryColor';

interface Props {
  name: string;
  size?: number;
  /** "You" gets the brand accent instead of a hashed colour. */
  isSelf?: boolean;
  /** Draw a ring in the card colour — for overlapping avatar stacks. */
  ringed?: boolean;
}

/**
 * A person's initials on a soft disc of their deterministic colour. The same
 * name is the same colour everywhere, with nothing stored.
 */
export function Avatar({ name, size = 40, isSelf = false, ringed = false }: Props) {
  const colors = useColors();
  const tint = isSelf ? colors.primary : colorForName(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: withAlpha(tint, 0.18),
        borderWidth: ringed ? 2 : 0,
        borderColor: colors.card,
      }}
    >
      <Text style={{ color: tint, fontFamily: fonts.bold, fontSize: Math.round(size * 0.38) }}>
        {isSelf ? 'You'.slice(0, size >= 36 ? 3 : 1) : initials(name)}
      </Text>
    </View>
  );
}

/** Overlapping avatars for a group header, capped with a "+3". */
export function AvatarStack({
  people,
  max = 4,
  size = 30,
}: {
  people: { name: string; isSelf: boolean }[];
  max?: number;
  size?: number;
}) {
  const colors = useColors();
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View key={`${p.name}-${i}`} style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}>
          <Avatar name={p.name} isSelf={p.isSelf} size={size} ringed />
        </View>
      ))}
      {extra > 0 ? (
        <View
          className="items-center justify-center rounded-full"
          style={{
            width: size,
            height: size,
            marginLeft: -size * 0.3,
            backgroundColor: colors.elevated,
            borderWidth: 2,
            borderColor: colors.card,
          }}
        >
          <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: Math.round(size * 0.34) }}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
