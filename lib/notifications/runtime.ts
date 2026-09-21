import { requireOptionalNativeModule } from 'expo';

import { fromISODate } from '../dates';
import { CHANNEL_SPECS, type PlannedNotification } from './plan';

/**
 * The native half: channels, permission, scheduling. Every judgement about
 * WHAT to send lives in `plan.ts`; this only carries it out.
 *
 * `expo-notifications` is native code, and an APK built before it was added
 * has no module — importing the package outright would throw on such a build
 * rather than degrade. It is required lazily behind a module check, the same
 * way `components/layout/glass.tsx` handles expo-blur, so an older build
 * simply has no reminders instead of no app.
 *
 * Every function here is safe to call when the module is missing: they
 * return a value that means "nothing happened" rather than throwing, because
 * a failed reminder must never cost a write. A budget alert is a courtesy; a
 * saved transaction is the product.
 */

export const NOTIFICATIONS_AVAILABLE = requireOptionalNativeModule('ExpoNotifications') != null;

type NotificationsModule = typeof import('expo-notifications');
// Only loadable when the native module is present, which a static import
// cannot express. The no-op path below is the fallback.
const N: NotificationsModule | null = NOTIFICATIONS_AVAILABLE
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-notifications') as NotificationsModule)
  : null;

/**
 * Create the three channels. Android drops a post to a channel that does not
 * exist and reports nothing, so this runs at boot, before anything can post.
 *
 * Creating a channel that already exists is a no-op, so this is safe on every
 * launch. Note that an EXISTING channel's importance cannot be lowered by the
 * app — Android deliberately leaves that to the user once they have seen it.
 *
 * No `Platform.OS` guard: `lib/` may not import React Native (it has to stay
 * loadable in Node — eslint.config.js), and this is an Android-only app. The
 * `N` check is the one that matters anyway, since the channel API only exists
 * where the native module does.
 */
export async function ensureChannels(): Promise<void> {
  if (!N) return;
  await Promise.all(
    CHANNEL_SPECS.map((c) =>
      N.setNotificationChannelAsync(c.id, {
        name: c.name,
        description: c.description,
        importance: c.importance,
      }),
    ),
  );
}

export type PermissionState = 'granted' | 'denied' | 'unavailable';

/** What Android currently thinks, without asking the user anything. */
export async function permissionState(): Promise<PermissionState> {
  if (!N) return 'unavailable';
  const { granted } = await N.getPermissionsAsync();
  return granted ? 'granted' : 'denied';
}

/**
 * Ask for POST_NOTIFICATIONS, in context.
 *
 * Called on the first subscription save, never at launch: a permission
 * prompt on a cold first run gets denied, and on Android a denial is close to
 * permanent — the system stops showing the dialog after two refusals, and the
 * only way back is the app's settings page. Asking when someone has just
 * created the thing the reminder is FOR is the one moment the request
 * explains itself.
 */
export async function requestPermission(): Promise<PermissionState> {
  if (!N) return 'unavailable';
  const existing = await N.getPermissionsAsync();
  if (existing.granted) return 'granted';
  // `canAskAgain` false means Android will not show the dialog: asking again
  // silently returns denied, so treat it as settled rather than retrying.
  if (!existing.canAskAgain) return 'denied';
  const asked = await N.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

/**
 * Replace every scheduled notification with `next`.
 *
 * Cancel-all-then-schedule, never a diff. Diffing scheduled notifications
 * means trusting that the app's idea of what is pending matches Android's,
 * and the two drift on every reboot, force-stop, restore and clock change.
 * Rescheduling wholesale is a few milliseconds and cannot drift.
 *
 * Returns how many were scheduled, so a caller can log or test it.
 */
export async function reschedule(next: readonly PlannedNotification[]): Promise<number> {
  if (!N) return 0;
  await N.cancelAllScheduledNotificationsAsync();

  let count = 0;
  for (const p of next) {
    const when = at(p.date, p.hour);
    // A trigger in the past never fires and would sit in the list forever.
    if (when.getTime() <= Date.now()) continue;
    await N.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: p.title,
        body: p.body,
        data: p.url ? { url: p.url } : {},
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: p.channel,
      },
    });
    count += 1;
  }
  return count;
}

/**
 * Post one notification now — what a budget alert does, since it is a
 * response to something that has just happened rather than a future event.
 */
export async function notifyNow(p: PlannedNotification): Promise<void> {
  if (!N) return;
  await N.scheduleNotificationAsync({
    identifier: p.id,
    content: {
      title: p.title,
      body: p.body,
      data: p.url ? { url: p.url } : {},
    },
    // null means "deliver immediately".
    trigger: null,
  });
}

/** Local wall-clock Date for an ISO day + hour. `hour < 0` means right now. */
function at(date: string, hour: number): Date {
  if (hour < 0) return new Date();
  const d = fromISODate(date as never);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** For the dev harness and a device check: what is actually pending. */
export async function pendingCount(): Promise<number> {
  if (!N) return 0;
  const all = await N.getAllScheduledNotificationsAsync();
  return all.length;
}
