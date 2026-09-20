import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useColors } from '@/lib/theme';
import { Text } from './Text';

/**
 * A small label over a figure (R4-2): "Income ₹35,18,977" in a summary row.
 *
 *   <StatFigure label="Income" dot={colors.income} tile>
 *     <Text weight="bold" size={16} variant="amount" tone="default">{formatINR(p, { whole: true })}</Text>
 *   </StatFigure>
 *   <StatFigure label="Spent" align="center"><AnimatedAmount paise={p} … /></StatFigure>
 *
 * The figure itself is the child, so it can be plain text or an AnimatedAmount.
 * - `dot`: a colour swatch before the label (a chart legend).
 * - `tile`: the elevated rounded box; `divider`: a hairline on the right, for a row of figures.
 * - `labelSize`: 11 (default, dense rows) or 12. `inset`: 4pt side padding (default on).
 */
export function StatFigure({
  label,
  dot,
  tile = false,
  divider = false,
  align = 'left',
  labelSize = 11,
  inset = true,
  children,
}: {
  label: string;
  dot?: string;
  tile?: boolean;
  divider?: boolean;
  align?: 'left' | 'center';
  labelSize?: 11 | 12;
  inset?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  const labelText = (
    <Text weight="medium" size={labelSize} tone="muted">
      {label}
    </Text>
  );
  return (
    <View
      className={
        tile
          ? 'flex-1 rounded-2xl px-3 py-2.5'
          : `flex-1${align === 'center' ? ' items-center' : ''}${inset ? ' px-1' : ''}`
      }
      style={[
        tile ? { backgroundColor: colors.elevated } : null,
        divider ? { borderRightWidth: 1, borderRightColor: colors.border } : null,
      ]}
    >
      {dot ? (
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
          {labelText}
        </View>
      ) : (
        labelText
      )}
      {children}
    </View>
  );
}
