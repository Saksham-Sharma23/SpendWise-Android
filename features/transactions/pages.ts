/**
 * Keyset paging for the ledger — the pure part, unit-tested.
 *
 * The ledger is ordered `date DESC, id DESC`, so every row has a total-order
 * key (date, id). Page 1 is live; each OLDER page is a fixed slice of that
 * order between two keys:
 *
 *   page 1 (live)   key >= pages[0].upper
 *   pages[i]        pages[i].lower <= key < pages[i].upper
 *   unloaded        key < pages[last].lower
 *
 * with `pages[i].upper === pages[i-1].lower`. Because the boundaries are
 * fixed keys rather than offsets, a row inserted at the top never pushes
 * another row into a gap between pages, and refetching one page can never
 * duplicate a row that belongs to its neighbour.
 *
 * A write only makes a page stale if it touched a transaction the page holds,
 * a category one of its rows shows, or a row whose key falls inside the
 * page's range (a backdated insert). Everything else is left alone — which is
 * the point: scrolling 2,000 rows deep and adding one transaction re-sends one
 * page, not 2,000 rows.
 */

export interface RowKey {
  date: string;
  id: number;
}

export interface PagedRow extends RowKey {
  categoryId: number | null;
}

export interface OlderPage<R extends PagedRow> {
  /** Exclusive: rows are strictly older than this key. */
  upper: RowKey;
  /** Inclusive: the oldest row this page loaded. */
  lower: RowKey;
  rows: R[];
}

export const keyOf = (r: RowKey): RowKey => ({ date: r.date, id: r.id });

/** True when `a` sorts strictly older (further down the ledger) than `b`. */
export function isOlder(a: RowKey, b: RowKey): boolean {
  return a.date < b.date || (a.date === b.date && a.id < b.id);
}

/**
 * Where a key lives: 'live' (page 1), the index of an older page, or
 * 'unloaded' (below everything loaded so far).
 */
export function locateKey<R extends PagedRow>(pages: OlderPage<R>[], key: RowKey): 'live' | 'unloaded' | number {
  if (pages.length === 0) return 'live';
  if (!isOlder(key, pages[0]!.upper)) return 'live';
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    if (isOlder(key, p.upper) && !isOlder(key, p.lower)) return i;
  }
  return 'unloaded';
}

export interface ChangeSet {
  /** Transaction row ids reported changed. */
  txIds: ReadonlySet<number>;
  /** Category row ids reported changed (renames and recolours show on rows). */
  categoryIds: ReadonlySet<number>;
  /** Current keys for changed transaction ids that no loaded page holds. */
  unknownKeys: RowKey[];
}

export interface Staleness {
  /** Older pages to refetch. */
  pages: Set<number>;
  /** A changed row landed below the loaded range: more rows may exist again. */
  belowLoaded: boolean;
}

/** Which older pages a batch of changes makes stale. Page 1 refreshes on its own. */
export function stalePages<R extends PagedRow>(pages: OlderPage<R>[], changes: ChangeSet): Staleness {
  const stale = new Set<number>();
  let belowLoaded = false;

  pages.forEach((p, i) => {
    for (const row of p.rows) {
      if (changes.txIds.has(row.id) || (row.categoryId != null && changes.categoryIds.has(row.categoryId))) {
        stale.add(i);
        return;
      }
    }
  });

  for (const key of changes.unknownKeys) {
    const where = locateKey(pages, key);
    if (typeof where === 'number') stale.add(where);
    else if (where === 'unloaded') belowLoaded = true;
  }

  return { pages: stale, belowLoaded };
}

/** Transaction ids in the change set that no older page currently holds. */
export function idsNotInPages<R extends PagedRow>(pages: OlderPage<R>[], txIds: ReadonlySet<number>): number[] {
  if (txIds.size === 0) return [];
  const held = new Set<number>();
  for (const p of pages) for (const r of p.rows) held.add(r.id);
  return [...txIds].filter((id) => !held.has(id));
}
