import { META_KEYS } from '@/db/schema';
import { readMeta, writeMeta } from '@/data/meta/sql';
import { freshDb } from '@/db/__tests__/support';

/**
 * `app_meta` reads and writes (R3-2). They used to live in db/seed.ts, bound
 * to the native handle, so they could not be tested at all.
 */
describe('app_meta', () => {
  let ctx: Awaited<ReturnType<typeof freshDb>>;
  beforeEach(async () => {
    ctx = await freshDb();
  });
  afterEach(() => ctx.sqlite.close());

  it('reads null for a key that was never set', () => {
    expect(readMeta(ctx.db, META_KEYS.ONBOARDING_DISMISSED)).toBeNull();
  });

  it('round-trips a value', () => {
    writeMeta(ctx.db, META_KEYS.ONBOARDING_DISMISSED, '1');
    expect(readMeta(ctx.db, META_KEYS.ONBOARDING_DISMISSED)).toBe('1');
  });

  it('overwrites rather than duplicating', () => {
    writeMeta(ctx.db, META_KEYS.LAST_BACKUP_AT, '2026-09-01T00:00:00.000Z');
    writeMeta(ctx.db, META_KEYS.LAST_BACKUP_AT, '2026-09-18T00:00:00.000Z');
    expect(readMeta(ctx.db, META_KEYS.LAST_BACKUP_AT)).toBe('2026-09-18T00:00:00.000Z');
    const n = ctx.sqlite.prepare("SELECT count(*) AS n FROM app_meta WHERE key = 'last_backup_at'").get() as {
      n: number;
    };
    expect(n.n).toBe(1);
  });
});
