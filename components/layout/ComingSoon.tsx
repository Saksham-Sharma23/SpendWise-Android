import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from './Screen';

/**
 * A screen whose feature hasn't shipped yet: the page chrome plus one empty
 * state saying what will live here and when (Sheets → 6A, Backup → 7).
 */
export function ComingSoon({
  title,
  subtitle,
  icon,
  heading,
  description,
  badge,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  heading: string;
  description: string;
  badge: string;
}) {
  return (
    <Screen back title={title} subtitle={subtitle}>
      <View className="px-5">
        <EmptyState icon={icon} title={heading} description={description} badge={badge} />
      </View>
    </Screen>
  );
}
