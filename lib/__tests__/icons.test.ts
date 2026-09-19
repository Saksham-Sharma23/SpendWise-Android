import { deterministicIcon } from '../identity';
import { ICON_NAMES, isIconName } from '../icons';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The test `lib/icons.ts` claimed existed.
 *
 * The map is read from `components/ui/iconMap.ts` as TEXT, not imported:
 * lucide-react-native pulls in React Native at import time, so Jest's Node
 * environment cannot load it at all. Reading the source is less elegant than
 * importing, and it is what makes the check possible without a component
 * renderer — the keys are plain string literals, so there is nothing to
 * mis-parse.
 *
 * Its comment said "the test in components/ui/__tests__ keeps the two in
 * step" for months while no such file existed (review T4). The gap is
 * expensive precisely because it is invisible: a name in one list and not the
 * other renders a fallback tag, so a category silently loses its icon and
 * nothing anywhere fails.
 *
 * `ICON_NAMES` is plain data that Node can load; the name → component map now
 * lives in `components/ui/iconMap.ts` for the same reason. Nothing here
 * renders — this is a set comparison, which is all it needs to be.
 */

/** The map's keys, read out of the source file. */
function mappedIconNames(): string[] {
  const source = readFileSync(join(__dirname, '..', '..', 'components', 'ui', 'iconMap.ts'), 'utf8');
  const block = /ICON_COMPONENTS: Record<string, LucideIcon> = \{(.*?)\n\};/s.exec(source);
  if (!block) throw new Error('Could not find ICON_COMPONENTS in components/ui/iconMap.ts');
  return [...block[1]!.matchAll(/^\s{2}'?([a-zA-Z0-9-]+)'?:/gm)].map((m) => m[1]!);
}

describe('the icon vocabulary and the component map agree', () => {
  it('maps exactly the names ICON_NAMES declares', () => {
    expect([...ICON_NAMES].sort()).toEqual(mappedIconNames().sort());
  });

  it('maps a plausible number of icons, so a broken parse cannot pass silently', () => {
    expect(mappedIconNames().length).toBeGreaterThan(40);
  });

  it('has no duplicate names', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });
});

describe('everything that produces an icon name produces a REAL one', () => {
  it('seeded categories only use names that exist', () => {
    // SYSTEM_CATEGORIES lives in db/seed.ts, which reaches db/client and so
    // pulls in native expo-sqlite that Jest cannot require. Reading the icon
    // names out of the source keeps the check without that dependency; R3-2
    // moves the seed data somewhere importable and this can use it directly.
    const source = readFileSync(join(__dirname, '..', '..', 'db', 'seed.ts'), 'utf8');
    const block = /SYSTEM_CATEGORIES: readonly SystemCategory\[\] = \[(.*?)\n\];/s.exec(source);
    expect(block).not.toBeNull();

    const icons = [...block![1]!.matchAll(/icon: '([^']+)'/g)].map((m) => m[1]!);
    expect(icons.length).toBeGreaterThan(10);
    for (const icon of icons) {
      expect(isIconName(icon)).toBe(true);
    }
  });

  /**
   * `lib/identity.ts` picks an icon for anything named — a subscription, a
   * group, a friend. Its KNOWN list and its fallbacks are written by hand, so
   * a typo there would show a tag and never be noticed.
   */
  it('deterministicIcon only ever returns a name that exists', () => {
    const names = [
      'Netflix',
      'Spotify Premium',
      'Home loan EMI',
      'Gym membership',
      'Electricity bill',
      'Broadband',
      'ChatGPT Plus',
      'iCloud storage',
      'Car insurance',
      'Petrol',
      'Something nobody mapped',
      '',
      '12345',
    ];
    for (const name of names) {
      expect(isIconName(deterministicIcon(name))).toBe(true);
    }
  });

  it('every fallback icon is a real name too', () => {
    // Hash-picked, so sweep enough names to hit each fallback.
    for (let i = 0; i < 300; i++) {
      expect(isIconName(deterministicIcon(`unmapped-${i}`))).toBe(true);
    }
  });
});
