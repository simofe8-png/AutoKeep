#!/usr/bin/env node
/**
 * Publishes an OTA update to the STAGING channel only (owner decision 2026-10-06), after checking
 * that a staging build with the same native runtime exists.
 *
 * The runtime version is the project fingerprint (app.json `runtimeVersion.policy: fingerprint`):
 * it changes whenever native code or native config changes. When no finished `staging-internal`
 * build has this runtime, the change cannot reach the phone over the air — the script stops and
 * says a new build is required (it never forces a native change through OTA).
 *
 * Usage:
 *   node tools/ota-staging.mjs --check            only the runtime check
 *   node tools/ota-staging.mjs --message "text"   check, then publish to channel "staging"
 * Needs an EAS login (locally) or EXPO_TOKEN (GitHub Actions secret). Never publishes to
 * "production": the channel is fixed here.
 */
import { execFileSync } from 'node:child_process';

const CHANNEL = 'staging';
const PROFILE = 'staging-internal';
// The staging build uses the production backend values (owner decision 2026-10-06).
const ENVIRONMENT = 'production';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const message = args[args.indexOf('--message') + 1];

// On Windows `npx` needs a shell, which splits arguments on spaces: quote them there.
const win = process.platform === 'win32';
const run = (cmd, a, opts = {}) =>
  execFileSync(cmd, win ? a.map((x) => (/[\s()]/.test(x) ? `"${x.replace(/"/g, '')}"` : x)) : a, {
    encoding: 'utf8',
    shell: win,
    ...opts,
  });

const local = JSON.parse(
  run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', 'android']),
).runtimeVersion;

const builds = JSON.parse(
  run('npx', [
    'eas-cli@latest',
    'build:list',
    '--platform',
    'android',
    '--build-profile',
    PROFILE,
    '--status',
    'finished',
    '--limit',
    '20',
    '--non-interactive',
    '--json',
  ]),
);
// eas-cli JSON: the runtime is `runtime.version`, the channel `updateChannel.name`.
const runtimeOf = (b) => b.runtime?.version ?? b.runtimeVersion;
const channelOf = (b) => b.updateChannel?.name ?? b.channel;
const match = builds.find((b) => runtimeOf(b) === local && channelOf(b) === CHANNEL);

if (!match) {
  console.error(
    [
      'STOP: no finished staging build has this runtime — native code or native config changed.',
      `  runtime of this commit: ${local}`,
      `  staging builds:         ${builds.map(runtimeOf).join(', ') || 'none'}`,
      'An OTA update would never reach the installed app. Build a new staging version:',
      `  npx eas-cli@latest build --platform android --profile ${PROFILE}`,
      'then submit it to Internal testing (docs/release/STAGING_OTA.md).',
    ].join('\n'),
  );
  process.exit(2);
}
console.log(
  `OK: staging build ${match.id} (versionCode ${match.appBuildVersion}) has runtime ${local}`,
);
if (checkOnly) process.exit(0);
if (!message) {
  console.error('--message "…" is required to publish');
  process.exit(1);
}

run(
  'npx',
  [
    'eas-cli@latest',
    'update',
    '--channel',
    CHANNEL,
    '--environment',
    ENVIRONMENT,
    '--platform',
    'android',
    '--message',
    message,
    '--non-interactive',
  ],
  { stdio: 'inherit' },
);
