#!/usr/bin/env node
// Starts Metro for the USB-connected Android phone (Expo Go), see ADR-0005.
//  - `adb reverse` maps the phone's 127.0.0.1:8081 to this machine.
//  - Node 24 resolves `localhost` to ::1 first, so Metro would listen on IPv6 only while Expo Go
//    fetches http://127.0.0.1:8081 → "Failed to download remote update". Force IPv4 first.
import { execFileSync, spawn } from 'node:child_process';

const port = process.env.RCT_METRO_PORT ?? '8081';
try {
  // Bounded: a wedged adb server must fail fast instead of hanging the dev workflow.
  execFileSync('adb', ['reverse', `tcp:${port}`, `tcp:${port}`], {
    stdio: 'inherit',
    timeout: 20_000,
  });
} catch {
  console.error('adb reverse failed — is the phone connected with USB debugging enabled?');
  process.exit(1);
}

const child = spawn(
  'npx',
  // --go: expo-dev-client is installed for EAS development builds; the phone check uses Expo Go.
  ['expo', 'start', '--go', '--localhost', '--port', port, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim(),
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 0));
