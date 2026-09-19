import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { SQLiteStatement } from 'expo-sqlite';

import { onBeforeClose, openReadConnection } from './connection';
import * as schema from './schema';

/**
 * The READ handle. Screens query through this, never through db/client.ts.
 *
 * Drizzle's expo driver runs every query with prepareSync/executeSync on the
 * JS thread — `await` only hides it — so a 100 ms aggregate froze touches,
 * navigation and JS animation for 100 ms. This handle builds the same typed
 * Drizzle queries but EXECUTES them through expo-sqlite's async API
 * (`executeForRawResultAsync`), which does the SQL work on a native worker
 * thread. Only the finished rows cross back to JS.
 *
 * Read-only by construction: a write through this handle throws, and its
 * connection is `query_only`. Writes stay synchronous on db/client.ts inside
 * `writeTx`, where atomicity needs them.
 *
 * It runs on its OWN connection (db/connection.ts `openReadConnection`), so a
 * read never waits for a write or makes one wait, and never sees a write that
 * hasn't committed (B22). Each query is its own snapshot: a load that runs
 * several queries at once can straddle a commit, and the change event that
 * commit raises re-runs it a moment later.
 *
 * Prepared statements are cached by SQL text (LRU). A statement is stepped by
 * one query at a time: if two identical queries overlap, the second prepares
 * a throwaway statement rather than sharing a cursor.
 */

const MAX_CACHED = 50;

interface Entry {
  stmt: SQLiteStatement;
  busy: boolean;
}

const cache = new Map<string, Entry>();

function evictOldestIdle(): void {
  for (const [sql, entry] of cache) {
    if (cache.size <= MAX_CACHED) return;
    if (entry.busy) continue;
    cache.delete(sql);
    void entry.stmt.finalizeAsync().catch(() => undefined);
  }
}

// Statements belong to the connection that prepared them; drop them before it closes.
onBeforeClose(() => {
  for (const entry of cache.values()) {
    try {
      entry.stmt.finalizeSync();
    } catch {
      // Already finalized or mid-step: the close proceeds regardless.
    }
  }
  cache.clear();
});

let runs = 0;
/** Dev instrumentation: how many read queries have executed since launch. */
export function readQueryCount(): number {
  return runs;
}

type Params = (string | number | null | Uint8Array | boolean)[];

async function execute(sql: string, params: Params): Promise<unknown[][]> {
  runs += 1;
  let entry = cache.get(sql);
  let owned = false;
  if (entry && !entry.busy) {
    // Re-insert to mark as most recently used.
    cache.delete(sql);
    cache.set(sql, entry);
  } else if (entry?.busy) {
    entry = { stmt: await openReadConnection().prepareAsync(sql), busy: false };
    owned = true;
  } else {
    entry = { stmt: await openReadConnection().prepareAsync(sql), busy: false };
    cache.set(sql, entry);
    evictOldestIdle();
  }

  entry.busy = true;
  try {
    const result = await entry.stmt.executeForRawResultAsync(params as never);
    const rows = (await result.getAllAsync()) as unknown[][];
    // Reset releases the statement's read snapshot; an unreset statement
    // would keep the WAL from checkpointing.
    await result.resetAsync();
    return rows;
  } catch (e) {
    // A failed statement may be in a bad state: never reuse it.
    if (!owned) cache.delete(sql);
    owned = true;
    throw e;
  } finally {
    entry.busy = false;
    if (owned) void entry.stmt.finalizeAsync().catch(() => undefined);
  }
}

export const readDb = drizzle(
  async (sql, params, method) => {
    if (method === 'run') {
      throw new Error('db/read.ts is read-only. Write through db/client.ts (writeTx).');
    }
    const rows = await execute(sql, params as Params);
    // sqlite-proxy wants arrays of values; for 'get' a single row (or undefined).
    return { rows: method === 'get' ? (rows[0] as unknown[]) : rows } as { rows: unknown[] };
  },
  { schema },
);

export type ReadDB = typeof readDb;
