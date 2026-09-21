/**
 * Asserts the RELEASE app config keeps the promises this app is built on.
 *
 *   1. INTERNET is blocked. "This app cannot transmit your financial data, and
 *      Android enforces it" is only true if the release manifest has no
 *      INTERNET permission (CLAUDE.md #1).
 *   2. allowBackup is on. Android auto-backup is one of the three durability
 *      layers; turning it off silently would remove it.
 *   3. The permissions that arrive uninvited stay blocked: SYSTEM_ALERT_WINDOW
 *      (Expo's template) and USE_BIOMETRIC / USE_FINGERPRINT (androidx.biometric,
 *      which nothing depends on since R6-4 — the block is a ratchet).
 *
 * It evaluates app.config.ts exactly as a release build does: no dev-network
 * opt-in, so the check fails closed if someone reintroduces a rule like the old
 * `NODE_ENV !== 'production'`, which once shipped INTERNET in a local release.
 *
 * This checks the CONFIG. The final word is still `npm run verify:apk` on the
 * built artifact, because library manifests can add permissions the config
 * never mentions — but that needs an Android build, which CI cannot afford on
 * every PR. This catches the common mistake cheaply; verify:apk catches the rest.
 *
 * Run: node scripts/check-release-policy.js
 */
const { spawnSync } = require('node:child_process');

const env = { ...process.env, EAS_BUILD_PROFILE: 'production' };
delete env.SPENDWISE_DEV_NETWORK;

const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['expo', 'config', '--json', '--type', 'public'],
  {
    encoding: 'utf8',
    env,
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32',
  },
);

// `expo config` may print notices before the JSON, so find the object itself.
const start = (run.stdout || '').indexOf('{');
if (run.status !== 0 || start < 0) {
  console.error('Could not evaluate the app config with `npx expo config`.');
  console.error(run.stderr || run.stdout || '(no output)');
  process.exit(1);
}

const config = JSON.parse(run.stdout.slice(start));
const android = config.android ?? {};
const problems = [];

const blocked = android.blockedPermissions ?? [];
// Each of these reaches the release manifest from a library or Expo's template
// unless blocked; verify:apk's allowlist has the final word on the artifact.
const MUST_BLOCK = [
  'android.permission.INTERNET',
  'android.permission.SYSTEM_ALERT_WINDOW', // Expo's prebuild template
  // androidx.biometric. Nothing depends on it since R6-4 removed
  // expo-secure-store; kept blocked so a future dependency cannot re-add them
  // without someone deciding to.
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
];
for (const p of MUST_BLOCK) {
  if (!blocked.includes(p)) problems.push(`android.blockedPermissions does not include ${p}`);
}
const declared = android.permissions ?? [];
if (declared.includes('android.permission.INTERNET')) {
  problems.push('android.permissions DECLARES android.permission.INTERNET in a release config');
}
if (android.allowBackup !== true) {
  problems.push(`android.allowBackup is ${JSON.stringify(android.allowBackup)}, expected true`);
}

if (problems.length > 0) {
  console.error('Release policy check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Release policy OK: ${MUST_BLOCK.length} permissions blocked (INTERNET first), allowBackup on.`);
