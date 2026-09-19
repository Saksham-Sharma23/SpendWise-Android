import { sql } from 'drizzle-orm';

import { readDb } from '../read';

/**
 * B29: the read handle's statement cache under two identical queries that
 * miss it in the same tick (the ledger and its summary mounting together).
 *
 * expo-sqlite cannot load in Node, so the read connection is faked: each
 * prepareAsync resolves on a later tick, which is what lets two queries
 * overlap, and every statement counts how often it was finalized. The code
 * under test is the shipped db/read.ts.
 *
 * The fake keeps its state inside the mocked module: db/read.ts registers its
 * close hook while it loads, before this file's own top-level code has run.
 */

interface FakeStatement {
  finalized: number;
}

interface FakeConnection {
  prepared: FakeStatement[];
  closeHooks: (() => void)[];
}

jest.mock('../connection', () => {
  const prepared: FakeStatement[] = [];
  const closeHooks: (() => void)[] = [];
  const fakeStatement = () => {
    const stmt = {
      finalized: 0,
      executeForRawResultAsync: async () => ({
        getAllAsync: async () => [[1]],
        resetAsync: async () => undefined,
      }),
      finalizeAsync: async () => {
        stmt.finalized += 1;
      },
      finalizeSync: () => {
        stmt.finalized += 1;
      },
    };
    return stmt;
  };
  return {
    prepared,
    closeHooks,
    openReadConnection: () => ({
      prepareAsync: () =>
        new Promise((resolve) => {
          const stmt = fakeStatement();
          prepared.push(stmt);
          setTimeout(() => resolve(stmt), 0);
        }),
    }),
    onBeforeClose: (hook: () => void) => {
      closeHooks.push(hook);
      return () => undefined;
    },
  };
});

const fake = jest.requireMock<FakeConnection>('../connection');
const flush = () => new Promise((r) => setTimeout(r, 5));

describe('readDb statement cache (B29)', () => {
  it('finalizes every statement exactly once when identical queries race', async () => {
    const query = sql`SELECT 1 AS one`;
    await Promise.all([readDb.all(query), readDb.all(query)]);
    await flush(); // the throwaway's finalizeAsync is fire-and-forget

    // Both missed the cache, so both prepared: one is cached, one thrown away.
    expect(fake.prepared).toHaveLength(2);
    expect(fake.prepared.filter((s) => s.finalized === 1)).toHaveLength(1);

    // Closing the connection finalizes what the cache still holds. Before the
    // fix the first statement had been overwritten in the cache, so neither
    // path ever finalized it: this was [0, 1].
    fake.closeHooks.forEach((hook) => hook());
    expect(fake.prepared.map((s) => s.finalized)).toEqual([1, 1]);
  });

  it('reuses the cached statement for the next identical query', async () => {
    const before = fake.prepared.length;
    const query = sql`SELECT 2 AS two`;
    await readDb.all(query);
    await readDb.all(query);
    expect(fake.prepared.length - before).toBe(1);
  });
});
