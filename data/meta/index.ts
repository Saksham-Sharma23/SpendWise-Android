/**
 * App state that is not user data (`app_meta`): schema and seed versions, the
 * last backup date, onboarding, integrity flags.
 *
 * These helpers lived in db/seed.ts, so the dashboard imported the SEEDER just
 * to dismiss onboarding (review A7). `sql.ts` is the tested core; `hooks.ts`
 * binds it to the app's handles.
 */
export { META_KEYS, getMeta, setMeta, useMeta, type MetaKey } from './hooks';
export { metaQuery, readMeta, writeMeta } from './sql';
