import { createSubmitGate } from '../submitGate';

/** R4-3: the double-tap guard every form relies on ("hammer Save → exactly one row"). */
describe('createSubmitGate', () => {
  it('runs once, then ignores every further tap after a successful write', () => {
    const gate = createSubmitGate();
    let writes = 0;
    const save = () => {
      writes += 1;
      return { ok: true };
    };
    expect(gate.run(save)).toEqual({ ok: true });
    expect(gate.run(save)).toBeUndefined();
    expect(gate.run(save)).toBeUndefined();
    expect(writes).toBe(1);
    expect(gate.busy).toBe(true);
  });

  it('re-opens after ok: false, so the form stays usable after an error toast', () => {
    const gate = createSubmitGate();
    expect(gate.run(() => ({ ok: false }))).toEqual({ ok: false });
    expect(gate.busy).toBe(false);
    expect(gate.run(() => ({ ok: true }))).toEqual({ ok: true });
  });

  it('re-opens after a throw, and re-throws', () => {
    const gate = createSubmitGate();
    expect(() =>
      gate.run(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(gate.busy).toBe(false);
  });

  it('ignores a second tap while an async submit is still running', async () => {
    const gate = createSubmitGate();
    let writes = 0;
    let finish: (v: { ok: boolean }) => void = () => undefined;
    const first = gate.run(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          writes += 1;
          finish = resolve;
        }),
    );
    expect(gate.run(async () => ({ ok: true }))).toBeUndefined();
    finish({ ok: false });
    await expect(first).resolves.toEqual({ ok: false });
    expect(gate.busy).toBe(false);
    expect(writes).toBe(1);
  });

  it('reports busy changes, for the button state', () => {
    const seen: boolean[] = [];
    const gate = createSubmitGate((b) => seen.push(b));
    gate.run(() => ({ ok: false }));
    gate.run(() => ({ ok: true }));
    expect(seen).toEqual([true, false, true]);
  });
});
