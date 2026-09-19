import { idsNotInPages, isOlder, locateKey, stalePages, type OlderPage, type PagedRow } from '../domain/pages';

const row = (date: string, id: number, categoryId: number | null = 1): PagedRow => ({ date, id, categoryId });

// Two older pages below the live page 1:
//   page 1 (live): key >= (2026-09-10, 50)
//   pages[0]:      (2026-09-01, 30) <= key < (2026-09-10, 50)
//   pages[1]:      (2026-08-20, 10) <= key < (2026-09-01, 30)
const pages: OlderPage<PagedRow>[] = [
  {
    upper: { date: '2026-09-10', id: 50 },
    lower: { date: '2026-09-01', id: 30 },
    rows: [row('2026-09-09', 45, 1), row('2026-09-05', 40, 2), row('2026-09-01', 30, 1)],
  },
  {
    upper: { date: '2026-09-01', id: 30 },
    lower: { date: '2026-08-20', id: 10 },
    rows: [row('2026-08-30', 25, 3), row('2026-08-20', 10, 3)],
  },
];

describe('isOlder', () => {
  it('orders by date, then id', () => {
    expect(isOlder({ date: '2026-09-01', id: 9 }, { date: '2026-09-02', id: 1 })).toBe(true);
    expect(isOlder({ date: '2026-09-01', id: 1 }, { date: '2026-09-01', id: 2 })).toBe(true);
    expect(isOlder({ date: '2026-09-01', id: 2 }, { date: '2026-09-01', id: 2 })).toBe(false);
  });
});

describe('locateKey', () => {
  it('places keys at and above the first boundary on the live page', () => {
    expect(locateKey(pages, { date: '2026-09-10', id: 50 })).toBe('live');
    expect(locateKey(pages, { date: '2026-09-14', id: 99 })).toBe('live');
    expect(locateKey([], { date: '2000-01-01', id: 1 })).toBe('live');
  });

  it('uses half-open ranges, so a boundary row belongs to exactly one page', () => {
    // (2026-09-01, 30) is pages[0].lower (inclusive) and pages[1].upper (exclusive).
    expect(locateKey(pages, { date: '2026-09-01', id: 30 })).toBe(0);
    expect(locateKey(pages, { date: '2026-09-01', id: 29 })).toBe(1);
    expect(locateKey(pages, { date: '2026-08-20', id: 10 })).toBe(1);
  });

  it('reports keys below everything loaded', () => {
    expect(locateKey(pages, { date: '2026-08-20', id: 9 })).toBe('unloaded');
  });
});

describe('stalePages', () => {
  const none = { txIds: new Set<number>(), categoryIds: new Set<number>(), unknownKeys: [] };

  it('marks only the page holding an edited or deleted transaction', () => {
    const s = stalePages(pages, { ...none, txIds: new Set([25]) });
    expect([...s.pages]).toEqual([1]);
    expect(s.belowLoaded).toBe(false);
  });

  it('marks every page showing a renamed category', () => {
    expect([...stalePages(pages, { ...none, categoryIds: new Set([1]) }).pages]).toEqual([0]);
    expect([...stalePages(pages, { ...none, categoryIds: new Set([3]) }).pages]).toEqual([1]);
  });

  it('routes a backdated insert to the page whose range contains it', () => {
    const s = stalePages(pages, { ...none, txIds: new Set([200]), unknownKeys: [{ date: '2026-09-03', id: 200 }] });
    expect([...s.pages]).toEqual([0]);
  });

  it('leaves older pages alone for a new row at the top', () => {
    const s = stalePages(pages, { ...none, txIds: new Set([201]), unknownKeys: [{ date: '2026-09-14', id: 201 }] });
    expect(s.pages.size).toBe(0);
  });

  it('flags a change below the loaded range', () => {
    const s = stalePages(pages, { ...none, txIds: new Set([202]), unknownKeys: [{ date: '2025-01-01', id: 202 }] });
    expect(s.pages.size).toBe(0);
    expect(s.belowLoaded).toBe(true);
  });
});

/**
 * B12: the key lookup silently sliced the changed ids to 500, so undoing a
 * 2,000-row bulk delete left deep pages showing rows that no longer existed.
 * When there are too many to look up, every loaded page is stale instead.
 */
describe('stalePages — a change too large to look up', () => {
  const none = { txIds: new Set<number>(), categoryIds: new Set<number>(), unknownKeys: [] };

  it('marks every loaded page stale', () => {
    const s = stalePages(pages, { ...none, txIds: new Set([9999]), overflowed: true });
    expect([...s.pages].sort()).toEqual([0, 1]);
  });

  it('also reopens paging, because rows may have appeared below what is loaded', () => {
    expect(stalePages(pages, { ...none, overflowed: true }).belowLoaded).toBe(true);
  });

  it('ignores the incomplete key list rather than trusting it', () => {
    // A partial unknownKeys that points at page 0 only must not narrow the
    // refresh to page 0 when the set is known to be incomplete.
    const s = stalePages(pages, {
      ...none,
      txIds: new Set([200]),
      unknownKeys: [{ date: '2026-09-03', id: 200 }],
      overflowed: true,
    });
    expect([...s.pages].sort()).toEqual([0, 1]);
  });

  it('is not triggered when the flag is absent', () => {
    expect([...stalePages(pages, { ...none, txIds: new Set([25]) }).pages]).toEqual([1]);
  });
});

describe('idsNotInPages', () => {
  it('returns only ids that no older page holds', () => {
    expect(idsNotInPages(pages, new Set([45, 10, 777]))).toEqual([777]);
    expect(idsNotInPages(pages, new Set())).toEqual([]);
  });
});
