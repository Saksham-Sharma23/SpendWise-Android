/**
 * The test for the linter.
 *
 * Every file in scripts/lint-fixtures breaks one rule on purpose and names it
 * in an `// EXPECT: <rule>` comment. This runs ESLint over them and fails if a
 * rule does not fire.
 *
 * Why this exists: a lint rule that silently stops matching is worse than no
 * rule, because the convention it guarded now looks enforced. Plugin upgrades
 * rename options (boundaries v7 renamed element-types to dependencies during
 * R2) and selectors drift with the AST. This catches both.
 */
const { spawnSync } = require('node:child_process');
const { readFileSync, readdirSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const DIR = join(__dirname, '..', 'lint-fixtures');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

const fixtures = walk(DIR);
const expectations = fixtures
  .map((file) => {
    const m = readFileSync(file, 'utf8').match(/^\/\/ EXPECT: (.+)$/m);
    return m ? { file, rule: m[1].trim() } : null;
  })
  .filter(Boolean);

if (expectations.length === 0) {
  console.error('lint:selftest found no fixtures with an `// EXPECT:` line.');
  process.exit(1);
}

// ESLint exits non-zero when it reports errors — which is the whole point
// here — so `status` is ignored and stdout is read either way.
const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['eslint', '--no-ignore', '-f', 'json', ...expectations.map((e) => e.file)],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
);

if (!run.stdout || !run.stdout.trim().startsWith('[')) {
  console.error('ESLint produced no JSON report.');
  console.error(run.stderr || run.stdout || '(no output)');
  process.exit(1);
}

const results = JSON.parse(run.stdout);
const byFile = new Map(results.map((r) => [r.filePath, r.messages.map((m) => m.ruleId)]));

let failed = 0;
for (const { file, rule } of expectations) {
  const fired = byFile.get(file) ?? [];
  const ok = fired.includes(rule);
  const where = relative(process.cwd(), file);
  if (ok) {
    console.log(`  ok    ${where}  (${rule})`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${where}  expected ${rule}, got: ${fired.join(', ') || 'nothing'}`);
  }
}

console.log(`\n${expectations.length - failed}/${expectations.length} lint rules fire as expected.`);
if (failed > 0) {
  console.error('A guard rail has stopped working. Fix eslint.config.js, not the fixture.');
  process.exit(1);
}
