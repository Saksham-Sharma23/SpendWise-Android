/**
 * "Only the newest request may deliver" — the guard that stops a slow, stale
 * query result from overwriting a newer one (search "sw" resolving after
 * "swiggy"). Pure, so it is unit-tested.
 */

export interface LatestOnly {
  /** Start a request; returns its ticket. Every earlier ticket becomes stale. */
  begin(): number;
  /** Whether `ticket` is still the newest live request. */
  isCurrent(ticket: number): boolean;
  /** Make every outstanding ticket stale (e.g. on unmount). */
  cancel(): void;
}

export function createLatestOnly(): LatestOnly {
  let current = 0;
  let cancelled = false;
  return {
    begin() {
      cancelled = false;
      current += 1;
      return current;
    },
    isCurrent(ticket) {
      return !cancelled && ticket === current;
    },
    cancel() {
      cancelled = true;
    },
  };
}
