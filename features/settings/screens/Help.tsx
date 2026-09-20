import {
  ArrowLeftRight,
  ChartColumn,
  Database,
  House,
  PiggyBank,
  Receipt,
  Repeat,
  Shield,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { rise } from '@/lib/motion';
import { accent, withAlpha, type AccentHue } from '@/lib/theme';
import { WARNING_RATIO } from '@/data/ledger/budgetState';
import { RETENTION_DAYS } from '../data/retention';

/**
 * How the app works, for someone who has just installed it.
 *
 * Written as answers to the questions people actually arrive with ("where do
 * my numbers come from?", "what happens if I delete something?") rather than
 * a tour of the menu, which the More screen already is.
 *
 * Every figure here is read from the code that enforces it — the retention
 * window, the budget warning threshold — so the help cannot quietly drift
 * from the behaviour it describes.
 */

interface Topic {
  icon: LucideIcon;
  tint: AccentHue;
  title: string;
  lines: string[];
}

const TOPICS: Topic[] = [
  {
    icon: Receipt,
    tint: 'lime',
    title: 'Adding money in and out',
    lines: [
      'The + button in the middle of the tab bar opens the form. Pick Expense or Income, type the amount, choose a category and save.',
      'The date defaults to today, and you can set it to any day — useful when you are catching up on a few days at once.',
      'A note is optional, but it is what search looks through later.',
    ],
  },
  {
    icon: House,
    tint: 'mint',
    title: 'Home',
    lines: [
      'Your balance for the month, and how this month compares with last.',
      'Below that: a trend chart, the categories you spent most on, how your budgets are doing, and what renews soon.',
      'Everything on Home follows the month you are in. It updates the moment you save something.',
    ],
  },
  {
    icon: ArrowLeftRight,
    tint: 'orange',
    title: 'Finding and fixing entries',
    lines: [
      'The Transactions tab lists everything, newest first, grouped by month.',
      'Search looks through notes and category names. The filter button narrows by type, by date, or by category, and each filter shows as a chip you can tap to remove.',
      'Swipe a row to delete it — a toast appears with an Undo. Long-press to select several at once.',
      'Export sends the list you are currently looking at, filters included, as a CSV file.',
    ],
  },
  {
    icon: ChartColumn,
    tint: 'violet',
    title: 'Insights',
    lines: [
      'Pick 3, 6, 12 or 24 months and everything below follows it.',
      'Drag across the chart to read any single month. The cards underneath show your average per day, your biggest single expense, your top category and how much you kept.',
      'The donut breaks one month into categories — tap the month name to change which one.',
    ],
  },
  {
    icon: PiggyBank,
    tint: 'lime',
    title: 'Budgets',
    lines: [
      'Set a monthly limit for any category. The dial is quicker than typing for round numbers.',
      `A budget warns you at ${Math.round(WARNING_RATIO * 100)}% and again when you go over.`,
      'Budgets reset on a day you choose, not necessarily the 1st — so a budget can follow your payday instead of the calendar.',
    ],
  },
  {
    icon: Repeat,
    tint: 'violet',
    title: 'Tracker',
    lines: [
      'Subscriptions and anything else that renews. Enter what it costs and how often, and the next date is worked out for you.',
      'Weekly, monthly, quarterly and yearly all convert to a monthly-equivalent total, so you can see what your subscriptions really cost per month.',
      'Pause one instead of deleting it if you are only stopping for a while.',
    ],
  },
  {
    icon: Tag,
    tint: 'amber',
    title: 'Categories',
    lines: [
      'The app starts with a set of common ones. Add your own, rename them, change the colour or icon at any time.',
      'Merging moves every entry from one category into another and removes the empty one — the safe way to clean up duplicates.',
      'A category can be for expenses, income, or both.',
    ],
  },
  {
    icon: Users,
    tint: 'blue',
    title: 'Groups and friends',
    lines: [
      'For expenses you share. Add the people, add what was paid, and the app works out who owes whom.',
      'Split equally, by exact amounts, by percentage, or by shares. More than one person can have paid.',
      'Groups are kept separate from your own spending: nothing here touches your balance, your budgets or your charts.',
      'Simplify is on by default, so three people owing each other in a circle becomes the smallest number of payments that settles it.',
    ],
  },
  {
    icon: Database,
    tint: 'lime',
    title: 'Backups',
    lines: [
      'More → Backup & restore. Three formats: a database file, the same file with a passphrase, or readable JSON.',
      'If you set a passphrase, nothing can open that backup without it — not you, not us. There is no reset.',
      'Restoring checks the file first and keeps a copy of what is already on your phone before it replaces anything.',
      'Android also backs the app up on its own, but it stops silently past 25 MB. Settings shows how close you are.',
    ],
  },
  {
    icon: Shield,
    tint: 'mint',
    title: 'Your data stays here',
    lines: [
      'SpendWise has no account, no servers and no internet permission. Nothing you type leaves this phone.',
      `A deleted entry is recoverable from Settings → Recently deleted for ${RETENTION_DAYS} days, then it is purged for good.`,
      'Because there is no server, a backup is the only way to move to a new phone — worth making one before you need it.',
    ],
  },
];

export function Help() {
  const topics = TOPICS;

  return (
    <Screen back title="How to use SpendWise" subtitle="What everything does, and where to find it">
      <View className="gap-4 px-5">
        {topics.map((t, i) => (
          <Animated.View key={t.title} entering={rise(i * 30)}>
            <TopicCard topic={t} />
          </Animated.View>
        ))}

        <Animated.View entering={rise(topics.length * 30)}>
          <Text variant="caption" tone="subtle" style={{ lineHeight: 18 }}>
            Every amount is stored in whole paise, so nothing is ever a rounding away from the truth.
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

function TopicCard({ topic }: { topic: Topic }) {
  const tint = accent(topic.tint);
  const Icon = topic.icon;

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-center gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: withAlpha(tint, 0.14) }}
        >
          <Icon size={18} color={tint} />
        </View>
        <Text weight="semibold" size={15} tone="default" className="flex-1">
          {topic.title}
        </Text>
      </View>

      <View className="gap-2">
        {topic.lines.map((line) => (
          <Text key={line} variant="caption" tone="muted" style={{ lineHeight: 19 }}>
            {line}
          </Text>
        ))}
      </View>
    </Card>
  );
}
