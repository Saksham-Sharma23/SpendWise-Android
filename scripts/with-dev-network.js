#!/usr/bin/env node
/**
 * Run a command with SPENDWISE_DEV_NETWORK=1, portably (npm runs scripts through
 * cmd.exe on Windows, where `VAR=1 cmd` does not work).
 *
 * app.config.ts grants INTERNET only when this variable is set (or on the EAS
 * development profile), so dev builds can reach Metro and every other build
 * fails closed. Usage: node scripts/with-dev-network.js expo prebuild --platform android
 */
const { spawnSync } = require('child_process');

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: with-dev-network.js <command> [args...]');
  process.exit(2);
}
const result = spawnSync(cmd === 'expo' ? 'npx' : cmd, cmd === 'expo' ? ['expo', ...args] : args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SPENDWISE_DEV_NETWORK: '1' },
});
process.exit(result.status ?? 1);
