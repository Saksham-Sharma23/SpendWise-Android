import { MAX_ENTRIES, formatEntry, parseLog, redactLine, redactStack, rotate, toEntry } from '../crashlog/redact';

/**
 * The crash log's whole justification is that it is safe to share. These
 * tests are that claim, written down: if one of them fails, the log is
 * carrying someone's spending out of their phone.
 */

describe('redactLine — nothing from the ledger survives', () => {
  it('strips rupee amounts in every shape lib/money.ts emits', () => {
    expect(redactLine('Failed to save ₹1,23,456.78')).toBe('Failed to save <amount>');
    expect(redactLine('limit INR 5000 exceeded')).toBe('limit <amount> exceeded');
    expect(redactLine('Rs. 249 charged')).toBe('<amount> charged');
    expect(redactLine('Rs 99.50')).toBe('<amount>');
  });

  it('strips notes and category names, which arrive quoted', () => {
    expect(redactLine('category "Late night biryani" not found')).toBe('category <text> not found');
    expect(redactLine("note 'dinner with Priya' too long")).toBe('note <text> too long');
  });

  it('strips dates — when someone spent is a fact about them', () => {
    expect(redactLine('no rows for 2026-03-15')).toBe('no rows for <date>');
  });

  it('strips long digit runs: paise, ids, epoch millis', () => {
    expect(redactLine('amount_paise=1299900 id=48213')).toBe('amount_paise=<n> id=<n>');
  });

  it('keeps short numbers, or a stack trace stops being one', () => {
    expect(redactLine('at Ledger.tsx:42:17')).toBe('at Ledger.tsx:42:17');
    expect(redactLine('expected 3 got 7')).toBe('expected 3 got 7');
  });

  it('strips picked-file URIs, which carry a filename the user chose', () => {
    expect(redactLine('cannot open content://com.android.providers/Holiday budget.xlsx')).toContain('<uri>');
    expect(redactLine('cannot open file:///storage/emulated/0/Download/pay.db')).toBe('cannot open <uri>');
  });

  it('takes currency before bare digits, so an amount is one token', () => {
    // ₹12,345 must not become '₹<n>' — the symbol would survive and the
    // reader would still know a money value was involved.
    expect(redactLine('over by ₹12,345')).toBe('over by <amount>');
  });
});

describe('toEntry — survives whatever was actually thrown', () => {
  const AT = '2026-09-21T09:00:00.000Z';

  it('reads an Error', () => {
    const e = toEntry(new TypeError('bad ₹500'), 'fatal', AT);
    expect(e.kind).toBe('TypeError');
    expect(e.message).toBe('bad <amount>');
    expect(e.level).toBe('fatal');
  });

  it('does not assume Error: code throws strings, nulls and objects', () => {
    expect(toEntry('plain string', 'error', AT).message).toBe('plain string');
    expect(toEntry(null, 'error', AT).kind).toBe('object');
    expect(toEntry(undefined, 'error', AT).message).toBe('undefined');
    expect(toEntry(42, 'error', AT).message).toBe('42');
  });

  it('redacts a thrown object rather than serialising it raw', () => {
    const e = toEntry({ note: 'secret dinner', amountPaise: 1299900 }, 'error', AT);
    expect(e.message).not.toContain('secret dinner');
    expect(e.message).not.toContain('1299900');
  });

  it('does not throw on a circular value', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => toEntry(a, 'error', AT)).not.toThrow();
  });
});

describe('context — which build, which screen', () => {
  const AT = '2026-09-21T09:00:00.000Z';

  it('carries the version and route into the head line', () => {
    const e = toEntry(new Error('boom'), 'fatal', AT, { app: 'v1.0.0', route: '/settings' });
    expect(formatEntry(e)).toContain('[v1.0.0 /settings]');
  });

  it('redacts the route too — a route can carry a name someone typed', () => {
    const e = toEntry(new Error('boom'), 'error', AT, { route: '/groups/1234567' });
    expect(e.route).toBe('/groups/<n>');
  });

  it('omits the brackets entirely when there is no context', () => {
    // A log line that reads `[] TypeError` invites the reader to wonder what
    // is missing. Nothing is: this entry was written before a route existed.
    expect(formatEntry(toEntry(new Error('boom'), 'error', AT))).not.toContain('[');
  });

  it('still parses as one entry with the context present', () => {
    const line = formatEntry(toEntry(new Error('boom'), 'fatal', AT, { app: 'v1.0.0', route: '/insights' }));
    expect(parseLog(line + '\n')).toHaveLength(1);
  });
});

describe('redactStack', () => {
  it('caps the frames — a 60-frame RN trace is unreadable', () => {
    const stack = ['Error: boom', ...Array.from({ length: 60 }, (_, i) => `    at frame${i} (x.js:1:1)`)].join('\n');
    expect(redactStack(stack).length).toBeLessThanOrEqual(12);
  });

  it('is empty for a missing stack rather than throwing', () => {
    expect(redactStack(undefined)).toEqual([]);
  });
});

describe('rotate — the file cannot grow without bound', () => {
  it('keeps the newest entries, oldest first', () => {
    const existing = Array.from({ length: MAX_ENTRIES }, (_, i) => `e${i}`);
    const next = rotate(existing, 'newest');
    expect(next).toHaveLength(MAX_ENTRIES);
    expect(next[next.length - 1]).toBe('newest');
    // The oldest was dropped, not the newest.
    expect(next[0]).toBe('e1');
  });

  it('does not trim below the cap', () => {
    expect(rotate(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseLog — a multi-line entry stays one entry', () => {
  it('splits on the timestamp, not on newlines', () => {
    const log = [
      formatEntry({
        at: '2026-09-21T09:00:00.000Z',
        level: 'fatal',
        kind: 'TypeError',
        message: 'boom',
        frames: ['at a', 'at b'],
      }),
      formatEntry({
        at: '2026-09-21T10:00:00.000Z',
        level: 'error',
        kind: 'RangeError',
        message: 'nope',
        frames: [],
      }),
    ].join('\n');

    const entries = parseLog(log);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain('at a');
    expect(entries[0]).toContain('at b');
    expect(entries[1]).toContain('RangeError');
  });

  it('is empty for an empty file', () => {
    expect(parseLog('')).toEqual([]);
    expect(parseLog('   \n ')).toEqual([]);
  });

  it('round-trips what rotate writes', () => {
    const one = formatEntry({
      at: '2026-09-21T09:00:00.000Z',
      level: 'error',
      kind: 'Error',
      message: 'x',
      frames: ['at y'],
    });
    expect(parseLog(rotate([], one).join('\n') + '\n')).toHaveLength(1);
  });
});
