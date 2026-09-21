import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import { formatEntry, parseLog, rotate, toEntry, type CrashEntry } from './redact';

/**
 * A crash log that lives on the phone and goes nowhere until the user sends
 * it (T9, R6).
 *
 * Release builds have no crash reporting. Sentry and every alternative need
 * `INTERNET`, which this app does not declare — that is the whole promise on
 * the Play listing, and it is worth more than automatic crash reports. The
 * cost is that a crash on someone else's phone is invisible unless they can
 * hand you something, so: a rotating local file, and a Share button.
 *
 * Everything written here is redacted first (`redact.ts`): no amounts, no
 * notes, no names, no dates. A log someone cannot safely share is a log that
 * never gets shared.
 */

export {
  MAX_ENTRIES,
  formatEntry,
  parseLog,
  redactLine,
  redactStack,
  rotate,
  toEntry,
  type CrashContext,
  type CrashEntry,
} from './redact';

const LOGS_DIR = 'logs';
const LOG_NAME = 'crash.log';

/**
 * Which build and which screen.
 *
 * Without the version, a log read a month later cannot be told apart from one
 * describing a bug that has already been fixed. Without the route, a stack of
 * minified frames rarely says which screen the user was actually on.
 */
let version: string | undefined;

function appVersion(): string | undefined {
  if (version === undefined) {
    try {
      version = `v${Constants.expoConfig?.version ?? '?'}`;
    } catch {
      version = 'v?';
    }
  }
  return version;
}

let route: string | undefined;

/**
 * Record the current route, so a crash can name the screen it happened on.
 *
 * A plain setter rather than a hook: this module is loaded at module scope in
 * `app/_layout.tsx`, before React renders anything, and `lib/` does not import
 * React. The root layout calls this from a `usePathname()` effect. The path is
 * redacted with everything else — a group route carries its name.
 */
export function noteRoute(path: string | undefined): void {
  route = path;
}

function logFile(): File {
  const dir = new Directory(Paths.document, LOGS_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, LOG_NAME);
}

/** Read the log as raw text. Empty string when there is none. */
export function readCrashLog(): string {
  try {
    const f = logFile();
    return f.exists ? f.textSync() : '';
  } catch {
    return '';
  }
}

/** How many entries are stored — what Settings shows without opening the file. */
export function crashCount(): number {
  return parseLog(readCrashLog()).length;
}

export function clearCrashLog(): void {
  try {
    const f = logFile();
    if (f.exists) f.delete();
  } catch {
    // Nothing to do; the file rotates itself anyway.
  }
}

/**
 * Append one entry, trimmed to the newest `MAX_ENTRIES`.
 *
 * Synchronous on purpose. A fatal error is followed by the JS context going
 * away, and an awaited write does not finish in time — the one entry worth
 * having is the one that never gets written.
 */
export function record(err: unknown, level: CrashEntry['level'] = 'error'): void {
  try {
    const entry = toEntry(err, level, new Date().toISOString(), { app: appVersion(), route });
    const f = logFile();
    const existing = f.exists ? parseLog(f.textSync()) : [];
    f.write(rotate(existing, formatEntry(entry)).join('\n') + '\n');
  } catch {
    // A crash logger that throws inside the crash handler turns a recoverable
    // error into a hard one. It stays quiet instead.
  }
}

let installed = false;

/**
 * Install the global handlers. Called once, at boot.
 *
 * `ErrorUtils` is React Native's own hook, not a DOM API — it is what the
 * red screen uses in dev and what silently kills the app in release. Chaining
 * to the previous handler matters: replacing it outright would stop the dev
 * red box appearing, hiding errors during development to log them for a
 * release nobody is running yet.
 */
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;

  try {
    const g = globalThis as unknown as {
      ErrorUtils?: {
        getGlobalHandler?: () => ((e: unknown, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const previous = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((e: unknown, isFatal?: boolean) => {
      record(e, isFatal ? 'fatal' : 'error');
      previous?.(e, isFatal);
    });
  } catch {
    // No ErrorUtils (a Node test, a web build): nothing to install.
  }

  // Unhandled promise rejections. Hermes routes these through the same
  // global, but only when the polyfill is active, so this is a second net
  // rather than a duplicate: `record` is cheap and the file rotates.
  try {
    const anyGlobal = globalThis as unknown as {
      addEventListener?: (t: string, h: (ev: { reason?: unknown }) => void) => void;
    };
    anyGlobal.addEventListener?.('unhandledrejection', (ev) => record(ev?.reason, 'error'));
  } catch {
    // Not available on this runtime.
  }
}

/** The file itself, for the share sheet. Null when nothing has been logged. */
export function crashLogFile(): File | null {
  try {
    const f = logFile();
    return f.exists ? f : null;
  } catch {
    return null;
  }
}
