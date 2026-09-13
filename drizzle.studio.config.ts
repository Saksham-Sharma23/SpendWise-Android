import type { Config } from 'drizzle-kit';

/**
 * Drizzle Studio against a database pulled off the phone.
 *
 * The main drizzle.config.ts uses `driver: 'expo'`, which only generates
 * migrations — Studio cannot open a database through it. This config points
 * Studio at ./local.db, which must be the DECRYPTED copy: the on-device file
 * is SQLCipher-encrypted and unreadable without the per-install key.
 *
 *   1. Dev harness → "Export decrypted copy"
 *   2. npm run db:pull
 *   3. npm run db:studio
 */
export default {
  schema: './db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: { url: './local.db' },
} satisfies Config;
