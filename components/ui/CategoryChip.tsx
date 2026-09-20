import { colorForName } from '@/lib/categoryColor';
import { useColors, withAlpha } from '@/lib/theme';
import { CategoryIcon } from './CategoryIcon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

/**
 * A category to pick, as a pill with its icon (R4-2). Shared by the
 * transaction, budget and subscription forms. Selected, it takes the
 * category's own colour.
 *
 *   <CategoryChip category={c} selected={field.value === c.id} onPress={() => field.onChange(c.id)} />
 *
 * `rest` is the unselected fill: `card` on a page, `elevated` on a sheet that is already card-coloured.
 */
export function CategoryChip({
  category,
  selected,
  onPress,
  rest = 'card',
}: {
  category: { name: string; icon: string | null; color: string | null };
  selected: boolean;
  onPress: () => void;
  rest?: 'card' | 'elevated';
}) {
  const colors = useColors();
  const color = category.color ?? colorForName(category.name);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      scaleTo={0.94}
      className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
      style={{
        borderColor: selected ? color : colors.border,
        backgroundColor: selected ? withAlpha(color, 0.16) : colors[rest],
      }}
    >
      <CategoryIcon icon={category.icon} color={color} size={26} />
      <Text weight={selected ? 'semibold' : 'medium'} size={13} tone={selected ? 'default' : 'muted'}>
        {category.name}
      </Text>
    </PressableScale>
  );
}
