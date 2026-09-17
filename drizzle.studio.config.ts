import type { Config } from 'drizzle-kit';

/**
 * Drizzle Studio against a database pulled off the phone.
 *
 * The main drizzle.config.ts uses `driver: 'expo'`, which only generates
 * migrations — Studio cannot open a database through it. This config points
 * Studio at ./local.db, a copy pulled off the phone.
 *
 * The main database is UNKEYED (decision 2026-09-14: SQLCipher is only used
 * for passphrase-protected backup FILES), so the pulled file opens directly.
 *
 *   1. Background the app, so the WAL is checkpointed into the .db
 *   2. npm run db:pull
 *   3. npm run db:studio
 */
export default {
  schema: './db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: { url: './local.db' },
} satisfies Config;
