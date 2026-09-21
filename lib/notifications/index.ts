/**
 * The notification layer's public surface.
 *
 * Lives in `lib/` rather than a feature because two different features need
 * it — the Tracker reschedules renewal reminders after a subscription write,
 * and Transactions raises budget alerts after a transaction write — and a
 * feature may never import a sibling feature.
 */

export {
  BACKUP_STALE_DAYS,
  CHANNELS,
  CHANNEL_SPECS,
  NOTIFY_HOUR,
  planBackupNudge,
  planBudgetAlert,
  planRenewalReminders,
  type BudgetAlertInput,
  type BudgetAlertLevel,
  type ChannelId,
  type ChannelSpec,
  type PlannedNotification,
  type RenewalReminderInput,
} from './plan';

export {
  NOTIFICATIONS_AVAILABLE,
  ensureChannels,
  notifyNow,
  pendingCount,
  permissionState,
  requestPermission,
  reschedule,
  type PermissionState,
} from './runtime';
