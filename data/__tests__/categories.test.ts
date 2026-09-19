import { categories } from '@/db/schema';
import { freshDb } from '@/db/__tests__/support';
import { allSync } from '@/db/types';
import { fitsType, liveCategoriesQuery } from '../categories/sql';

/**
 * The one live-category query (R3-3), run as shipped on the real schema.
 */
describe('liveCategoriesQuery', () => {
  let ctx: Awaited<ReturnType<typeof freshDb>>;
  beforeAll(async () => {
    ctx = await freshDb();
    ctx.db
      .insert(categories)
      .values([
        { uid: 'c1', name: 'Rent', icon: 'house', color: '#7A6A5A', kind: 'expense' },
        { uid: 'c2', name: 'Salary', icon: 'wallet', color: '#2E8B57', kind: 'income' },
        { uid: 'c3', name: 'Gifts', icon: 'gift', color: '#C75E5E', kind: 'both' },
        {
          uid: 'c4',
          name: 'Old',
          icon: 'tag',
          color: '#8A8A8A',
          kind: 'expense',
          deletedAt: '2026-09-01T00:00:00.000Z',
        },
      ])
      .run();
  });
  afterAll(() => ctx.sqlite.close());

  const names = (rows: { name: string }[]) => rows.map((r) => r.name);

  it('lists live categories alphabetically, never deleted ones', () => {
    expect(names(allSync<{ name: string }>(liveCategoriesQuery(ctx.db)))).toEqual(['Gifts', 'Rent', 'Salary']);
  });

  it('offers expense categories and "both" on an expense', () => {
    expect(names(allSync<{ name: string }>(liveCategoriesQuery(ctx.db, 'expense')))).toEqual(['Gifts', 'Rent']);
  });

  it('never offers an expense-only category on income', () => {
    expect(names(allSync<{ name: string }>(liveCategoriesQuery(ctx.db, 'income')))).toEqual(['Gifts', 'Salary']);
  });
});

describe('fitsType', () => {
  it('agrees with the query', () => {
    expect(fitsType({ kind: 'both' }, 'income')).toBe(true);
    expect(fitsType({ kind: 'expense' }, 'income')).toBe(false);
    expect(fitsType({ kind: 'income' }, 'income')).toBe(true);
  });
});
