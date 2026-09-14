import { reconcileSystemCategories, type SystemCategory } from '../seedCore';
import { freshDb } from './support';

/** [U4] Versioned, identity-based seeding against a real migrated schema. */

const V1: SystemCategory[] = [
  { uid: 'sys:rent', name: 'Rent', icon: 'house', color: '#7A6A5A', kind: 'expense' },
  { uid: 'sys:salary', name: 'Salary', icon: 'wallet', color: '#2E8B57', kind: 'income' },
];
const V2: SystemCategory[] = [...V1, { uid: 'sys:pets', name: 'Pets', icon: 'dog', color: '#8A5410', kind: 'expense' }];
const NOW = '2026-09-14T10:00:00.000Z';

type Row = { uid: string; name: string; kind: string; is_system: number; deleted_at: string | null };

describe('reconcileSystemCategories', () => {
  it('seeds a fresh install with uids and kinds', async () => {
    const { sqlite, db } = await freshDb();
    expect(reconcileSystemCategories(db, V1, 1, '1', NOW)).toEqual({ inserted: 2, skipped: false });
    const rows = sqlite.prepare('SELECT uid, name, kind, is_system FROM categories ORDER BY uid').all();
    expect(rows).toEqual([
      { uid: 'sys:rent', name: 'Rent', kind: 'expense', is_system: 1 },
      { uid: 'sys:salary', name: 'Salary', kind: 'income', is_system: 1 },
    ]);
  });

  it('does nothing when the stored version is current', async () => {
    const { db } = await freshDb();
    reconcileSystemCategories(db, V1, 1, '1', NOW);
    expect(reconcileSystemCategories(db, V1, 1, '1', NOW)).toEqual({ inserted: 0, skipped: true });
  });

  it('adds only the new category on a version bump, leaving renamed ones alone', async () => {
    const { sqlite, db } = await freshDb();
    reconcileSystemCategories(db, V1, 1, '1', NOW);
    sqlite.prepare("UPDATE categories SET name = 'House rent' WHERE uid = 'sys:rent'").run();

    expect(reconcileSystemCategories(db, V2, 2, '1', NOW)).toEqual({ inserted: 1, skipped: false });
    const rows = sqlite.prepare('SELECT uid, name FROM categories ORDER BY uid').all() as Row[];
    // The rename did NOT cause "Rent" to be re-added: identity is the uid.
    expect(rows.map((r) => r.name)).toEqual(['Pets', 'House rent', 'Salary']);
    const version = sqlite.prepare("SELECT value FROM app_meta WHERE key = 'seed_version'").get() as { value: string };
    expect(version.value).toBe('2');
  });

  it("skips a new system name that clashes with the user's own live category", async () => {
    const { sqlite, db } = await freshDb();
    reconcileSystemCategories(db, V1, 1, '1', NOW);
    sqlite.prepare("INSERT INTO categories (name) VALUES ('pets')").run();
    expect(reconcileSystemCategories(db, V2, 2, '1', NOW)).toEqual({ inserted: 0, skipped: false });
    const pets = sqlite.prepare("SELECT count(*) AS n FROM categories WHERE lower(name) = 'pets'").get() as { n: number };
    expect(pets.n).toBe(1);
  });
});
