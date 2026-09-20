/**
 * The "hammer Save → exactly one row" guarantee, as a pure gate (R4-3).
 *
 * react-hook-form validates asynchronously, so two quick taps both reach the
 * submit handler before any re-render could disable the button, and with no
 * server nothing would ever deduplicate the second row. The forms each kept a
 * `useRef` flag for this; `useSubmitOnce` (components/ui/FormModal) wraps this.
 *
 * `run(fn)`:
 * - while a run is in progress (or has succeeded), further runs are ignored and return undefined;
 * - `fn` returns a WriteResult-like `{ ok }`. `ok: false` re-opens the gate, so
 *   the form stays usable after safeWrite's error toast; `ok: true` keeps it
 *   shut, because the form is closing;
 * - a throw re-opens it and re-throws; a promise is awaited the same way.
 */

export interface GateResult {
  ok: boolean;
}

export interface SubmitGate {
  readonly busy: boolean;
  run<R extends GateResult>(fn: () => R): R | undefined;
  run<R extends GateResult>(fn: () => Promise<R>): Promise<R | undefined> | undefined;
}

export function createSubmitGate(onBusyChange?: (busy: boolean) => void): SubmitGate {
  let busy = false;
  const set = (next: boolean) => {
    if (busy === next) return;
    busy = next;
    onBusyChange?.(next);
  };

  function run<R extends GateResult>(fn: () => R | Promise<R>): R | Promise<R | undefined> | undefined {
    if (busy) return undefined;
    set(true);
    let out: R | Promise<R>;
    try {
      out = fn();
    } catch (e) {
      set(false);
      throw e;
    }
    if (out instanceof Promise) {
      return out.then(
        (r) => {
          if (!r.ok) set(false);
          return r;
        },
        (e: unknown) => {
          set(false);
          throw e;
        },
      );
    }
    if (!out.ok) set(false);
    return out;
  }

  return {
    get busy() {
      return busy;
    },
    run: run as SubmitGate['run'],
  };
}
