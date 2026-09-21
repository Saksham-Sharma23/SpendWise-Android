/**
 * Making a crash report safe to share.
 *
 * This is the whole reason the crash log can exist at all. Release builds
 * have no crash reporting — Sentry needs `INTERNET`, which this app does not
 * have and will not ask for — so the only way to learn why something broke is
 * for the user to send a file. A file that carries what they spent, on what,
 * and on which day is not a file anyone should be asked to send.
 *
 * So: **no amounts, no notes, no names.** An error message is free text
 * written by whoever threw it, and several of ours interpolate user data
 * (`UserFacingError` in particular), so nothing may be trusted through
 * unexamined. Everything that could be a figure or a phrase from the ledger
 * is replaced before the line is ever written to disk.
 *
 * Pure, so the promise is tested rather than asserted.
 */

/**
 * Long digit runs: paise amounts, ids, timestamps-as-numbers. Four or more,
 * so `at line 12` and `v3` survive — a stack trace with every number stripped
 * is not a stack trace.
 */
const LONG_NUMBER = /\d{4,}/g;

/** ₹1,23,456.78 and friends, in any of the shapes lib/money.ts emits. */
const CURRENCY = /(?:₹|INR|Rs\.?)\s*[\d,]+(?:\.\d+)?/gi;

/** A quoted string: the usual carrier of a note or a category name. */
const QUOTED = /(["'])(?:(?!\1)[^\\]|\\.){2,}?\1/g;

/** 'YYYY-MM-DD' — a date is a fact about someone's spending. */
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;

/**
 * An absolute path. Android sandbox paths carry the package name, which is
 * fine, but a picked-file URI can carry a filename the user chose.
 */
const FILE_URI = /(?:file|content):\/\/\S+/gi;

/**
 * Strip anything that could be a figure, a phrase or a date from one line.
 *
 * Order matters: currency before long numbers, so `₹12,345` becomes one
 * `<amount>` rather than a `₹` followed by `<n>`.
 */
export function redactLine(line: string): string {
  return line
    .replace(FILE_URI, '<uri>')
    .replace(CURRENCY, '<amount>')
    .replace(ISO_DATE, '<date>')
    .replace(QUOTED, '<text>')
    .replace(LONG_NUMBER, '<n>');
}

/**
 * The frames worth keeping: ours, plus the first few of anyone else's.
 *
 * A full React Native trace is ~60 frames of framework internals. The top
 * frames are where the fault is, and the rest is noise that makes a shared
 * log too long for anyone to read.
 */
export const MAX_FRAMES = 12;

export function redactStack(stack: string | undefined): string[] {
  if (!stack) return [];
  return stack
    .split('\n')
    .slice(0, MAX_FRAMES)
    .map((l) => redactLine(l.trim()))
    .filter(Boolean);
}

export interface CrashEntry {
  /** ISO timestamp, to the second. */
  at: string;
  /** 'fatal' for an uncaught error, 'error' for a handled one worth keeping. */
  level: 'fatal' | 'error';
  /** The error's constructor name — `TypeError`, `UserFacingError`. */
  kind: string;
  /** Redacted message. */
  message: string;
  /** Redacted stack, newest frame first. */
  frames: string[];
  /**
   * The app version that produced this. A log without it is unreadable once
   * more than one build exists: the fix may already have shipped.
   */
  app?: string;
  /** The route the user was on, redacted like everything else. */
  route?: string;
}

/** What the runtime knows and the pure layer cannot find out for itself. */
export interface CrashContext {
  app?: string;
  route?: string;
}

/**
 * Build one entry from a thrown value.
 *
 * Takes `unknown` because that is what a global handler actually receives:
 * code throws strings, nulls and objects as well as Errors, and a crash
 * logger that assumes `Error` crashes inside the crash handler.
 */
export function toEntry(err: unknown, level: CrashEntry['level'], at: string, ctx: CrashContext = {}): CrashEntry {
  // The version is ours, not the user's; the route is a path and can carry a
  // name (`/groups/weekend-trip`), so it goes through the same redaction.
  const context = {
    ...(ctx.app ? { app: ctx.app } : {}),
    ...(ctx.route ? { route: redactLine(ctx.route) } : {}),
  };

  if (err instanceof Error) {
    return {
      at,
      level,
      kind: err.name || 'Error',
      message: redactLine(err.message ?? ''),
      frames: redactStack(err.stack),
      ...context,
    };
  }
  return {
    at,
    level,
    kind: typeof err,
    message: redactLine(safeString(err)),
    frames: [],
    ...context,
  };
}

function safeString(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    // Circular, or a getter that throws. The type alone is still a clue.
    return `[unserialisable ${typeof v}]`;
  }
}

/** One line per entry: greppable, and small enough to read in a share sheet. */
export function formatEntry(e: CrashEntry): string {
  const context = [e.app, e.route].filter(Boolean).join(' ');
  const head = `${e.at} ${e.level.toUpperCase()} ${context ? `[${context}] ` : ''}${e.kind}: ${e.message}`;
  return e.frames.length ? `${head}\n${e.frames.map((f) => `    ${f}`).join('\n')}` : head;
}

/** How many entries the file keeps. */
export const MAX_ENTRIES = 200;

/**
 * Keep the newest `MAX_ENTRIES`, oldest first in the file.
 *
 * Trimming on write rather than on read means the file cannot grow without
 * bound even if nothing ever reads it — which is the normal case, since the
 * log exists for the one day something goes wrong.
 */
export function rotate(existing: readonly string[], addition: string, max = MAX_ENTRIES): string[] {
  const next = [...existing, addition];
  return next.length <= max ? next : next.slice(next.length - max);
}

/** Split a stored log back into entries. Entries start with an ISO timestamp. */
export function parseLog(raw: string): string[] {
  if (!raw.trim()) return [];
  const out: string[] = [];
  for (const line of raw.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) out.push(line);
    else if (out.length) out[out.length - 1] += `\n${line}`;
  }
  return out;
}
