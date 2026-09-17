import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The architecture rule, tested the only way it can be: by writing a violation
 * into the real tree and asserting ESLint rejects it.
 *
 * `npm run lint:selftest` cannot cover this one. `boundaries/dependencies`
 * only applies to paths in `boundaries/include` — app, features, data,
 * components, db, lib — so a fixture parked outside those folders can never
 * trigger it, and a fixture inside them would be linted by every normal run.
 *
 * This matters more than the other rules: "a feature never imports a sibling"
 * is the single constraint holding the architecture together, and it is the
 * one most likely to break quietly when the plugin is upgraded. It already did
 * once — boundaries v7 renamed `element-types` to `dependencies`, and the old
 * name kept "working" while reporting nothing.
 */

const ROOT = join(__dirname, '..', '..');

function lint(file: string): string {
  try {
    execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['eslint', '--no-ignore', '-f', 'json', file], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
    return '[]';
  } catch (e) {
    // ESLint exits non-zero when it reports problems, which is the point.
    const out = (e as { stdout?: string }).stdout;
    return out && out.trim().startsWith('[') ? out : '[]';
  }
}

function rulesFiredFor(relativePath: string, source: string): string[] {
  const dir = join(ROOT, 'features', 'transactions', '__lint_tmp__');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, relativePath);
  writeFileSync(file, source, 'utf8');
  try {
    const results = JSON.parse(lint(file)) as { messages: { ruleId: string | null }[] }[];
    return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? ''));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('the layer boundaries are actually enforced', () => {
  // ESLint has to start up for each case, so these are slower than a unit test.
  jest.setTimeout(120_000);

  it('rejects a feature importing a sibling feature', () => {
    const fired = rulesFiredFor(
      'imports-sibling.ts',
      ["import { splitEqual } from '../../groups/split';", 'export const bad = splitEqual;', ''].join('\n'),
    );
    expect(fired).toContain('boundaries/dependencies');
  });

  it('allows a feature to import its OWN files', () => {
    const fired = rulesFiredFor(
      'imports-own.ts',
      ["import { buildWhere } from '../filters';", 'export const fine = buildWhere;', ''].join('\n'),
    );
    expect(fired).not.toContain('boundaries/dependencies');
  });

  it('allows a feature to import down into lib', () => {
    const fired = rulesFiredFor(
      'imports-lib.ts',
      ["import { formatINR } from '../../../lib/money';", 'export const fine = formatINR;', ''].join('\n'),
    );
    expect(fired).not.toContain('boundaries/dependencies');
  });
});
