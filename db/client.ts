import { drizzle } from 'drizzle-orm/expo-sqlite';

import { sqliteDb } from './connection';
import * as schema from './schema';
import { runWriteTx } from './tx';

export { DATABASE_NAME, sqliteDb } from './connection';

/**
 * The synchronous Drizzle handle: WRITES and tiny point reads only.
 *
 * Every query on this handle runs on the JS thread (the expo driver calls
 * prepareSync/executeSync). Screens read through db/read.ts instead, which
 * executes on expo-sqlite's native worker thread.
 */
export const db = drizzle(sqliteDb, { schema });

export type DB = typeof db;
export type WriteTx = Parameters<Parameters<DB['transaction']>[0]>[0];

/** Run a multi-statement write atomically. The callback must be synchronous. */
export function writeTx<T>(fn: (tx: WriteTx) => T): T {
  return runWriteTx(db, fn);
}

export { schema };
