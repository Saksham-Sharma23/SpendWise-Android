import type { Config } from 'drizzle-kit';

/**
 * `driver: 'expo'` makes drizzle-kit emit a migrations.js bundle alongside the
 * .sql files, which the Expo migrator imports directly. Combined with the
 * inline-import babel plugin, that means a schema change ships over EAS
 * Update like any other JS change — no native rebuild required.
 */
export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
