import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { rise } from '@/lib/motion';
import { Text } from './Text';

/**
 * A block of a screen that rises into place in turn (R4-2).
 *
 *   <Section index={2}>…</Section>                                   // Home / Insights cards
 *   <Section index={1} label="Date" stagger={{ base: 0, step: 60 }} className="mt-6">…</Section>
 *   <Section label="Category" action={<Button variant="ghost" size="sm" … />}>…</Section>
 *
 * `index` orders the entrance: it waits `base + index × step` ms (lib/motion
 * caps the wait). With a `label` it heads the block with a section label, and
 * `action` sits at that label's right-hand end.
 */
export function Section({
  index = 0,
  label,
  action,
  stagger = { base: 60, step: 70 },
  className = 'px-5',
  children,
}: {
  index?: number;
  label?: string;
  action?: ReactNode;
  stagger?: { base: number; step: number };
  className?: string;
  children: ReactNode;
}) {
  return (
    <Animated.View entering={rise(stagger.base + index * stagger.step)} className={className}>
      {label ? (
        action ? (
          <View className="flex-row items-center justify-between">
            <FieldLabel>{label}</FieldLabel>
            {action}
          </View>
        ) : (
          <FieldLabel>{label}</FieldLabel>
        )
      ) : null}
      {children}
    </Animated.View>
  );
}

/**
 * The uppercase label over a form field or a section, 10pt above its content.
 *
 *   <FieldLabel>Category</FieldLabel>
 */
export function FieldLabel({ children, top = false }: { children: string; top?: boolean }) {
  return (
    <Text variant="label" tone="muted" style={{ marginBottom: 10, marginTop: top ? 24 : undefined }}>
      {children}
    </Text>
  );
}
