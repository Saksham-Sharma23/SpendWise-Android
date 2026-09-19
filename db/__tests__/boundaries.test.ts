import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The architecture rule, tested the only way it can be: by writing violations
 * into the real tree and asserting ESLint rejects them.
 *
 * `npm run lint:selftest` cannot cover this one. `boundaries/dependencies`
 * only applies to paths in `boundaries/include` — app, features, data,
 * components, db, lib — so a fixture parked outside those folders can never
 * trigger it, and one inside them would be linted by every normal run.
 *
 * This matters more than the other rules: "a feature never imports a sibling"
 * is the single constraint holding the architecture together, and it is the
 * most likely to break quietly on a plugin upgrade. It already did once —
 * boundaries v7 renamed `element-types` to `dependencies` during R2, and the
 * old name kept "working" while reporting nothing at all.
 *
 * All the cases go through ONE ESLint run: starting it costs ~10 s, and a
 * suite people skip because it is slow protects nothing.
 */

const ROOT = join(__dirname, '..', '..');
const TMP_DIR = join(ROOT, 'features', 'transactions', '__lint_tmp__');

const CASES = [
  {
    name: 'imports-sibling.ts',
    what: 'a feature importing a SIBLING feature',
    // The `@/` form, because that is what real code uses (rule 5) and it is
    // the one `boundaries/dependencies` must judge on its own merits. Written
    // as '../../groups/...' this passed for the WRONG reason: no-restricted-
    // imports rejected the `../../`, and import/no-unresolved the bad path,
    // so boundaries never saw it and a silent plugin breakage would not show.
    source: "import { splitEqual } from '@/features/groups/domain/split';\nexport const bad = splitEqual;\n",
    expectRejected: true,
  },
  {
    name: 'imports-own.ts',
    what: 'a feature importing its OWN files',
    // A real path inside this feature. '../filters' did not exist (the file is
    // data/filters.ts), so this case only ever raised import/no-unresolved.
    source: "import { buildWhere } from '../data/filters';\nexport const fine = buildWhere;\n",
    expectRejected: false,
  },
  {
    name: 'imports-lib.ts',
    what: 'a feature importing down into lib',
    // `@/` again: '../../../lib/money' is rejected by rule 5 before boundaries
    // sees it, which made this "allowed" assertion pass for the wrong reason.
    source: "import { formatINR } from '@/lib/money';\nexport const fine = formatINR;\n",
    expectRejected: false,
  },
] as const;

interface LintResult {
  filePath: string;
  messages: { ruleId: string | null }[];
}

/** Write every case, lint them all at once, and return the rules each triggered. */
function lintAllCases(): Map<string, string[]> {
  mkdirSync(TMP_DIR, { recursive: true });
  const files = CASES.map((c) => {
    const file = join(TMP_DIR, c.name);
    writeFileSync(file, c.source, 'utf8');
    return file;
  });

  let raw = '[]';
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['eslint', '--no-ignore', '-f', 'json', ...files], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (e) {
    // ESLint exits non-zero when it reports problems, which is the point here.
    const out = (e as { stdout?: string }).stdout;
    if (out && out.trim().startsWith('[')) raw = out;
  } finally {
    rmSync(TMP_DIR, { recursive: true, force: true });
  }

  const results = JSON.parse(raw) as LintResult[];
  const byName = new Map<string, string[]>();
  for (const r of results) {
    const name = r.filePath.split(/[\\/]/).pop()!;
    byName.set(
      name,
      r.messages.map((m) => m.ruleId ?? ''),
    );
  }
  return byName;
}

describe('the layer boundaries are actually enforced', () => {
  jest.setTimeout(120_000);

  let fired: Map<string, string[]>;
  beforeAll(() => {
    fired = lintAllCases();
  });

  it('linted every case, so a silent no-op cannot pass as success', () => {
    // If ESLint returned nothing at all, the "allowed" assertions below would
    // pass for the wrong reason.
    expect(fired.get('imports-sibling.ts')).toBeDefined();
  });

  for (const c of CASES) {
    it(`${c.expectRejected ? 'rejects' : 'allows'} ${c.what}`, () => {
      const rules = fired.get(c.name) ?? [];
      if (c.expectRejected) {
        expect(rules).toContain('boundaries/dependencies');
      } else {
        // Not just "boundaries stayed quiet": the fixture must be CLEAN. An
        // allowed import that trips any other rule means the fixture no longer
        // resembles real code, and the case stops proving anything — which is
        // exactly how all three of these silently rotted once.
        expect(rules).toEqual([]);
      }
    });
  }
});
