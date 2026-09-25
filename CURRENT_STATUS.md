# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-25_

## Position

- **Milestone:** M01 Design System
- **Current task:** T007 (RTL Hebrew foundation, typography, layout, design tokens)
- **Last verified PASS:** T006 — M00 PASS
- **Next action:** build src/ui tokens and the RTL foundation

## Granted policies

- Local git commits at meaningful verified checkpoints (normally milestone PASS). No push. (User, 2026-09-25)
- Android verification on the user's physical phone through Expo Go. The user connects it when needed. (User, 2026-09-25)
- Proportional per-task verification, with the full suite at milestone gates. (User, 2026-09-25)

## Environment notes

- Node 24.16, npm 11.13, JDK 17, adb, Docker Desktop, gh are installed. The Supabase CLI is used through `npx supabase`.
- `ANDROID_HOME=C:\Android\Sdk` (no emulator); the full SDK is at `%LOCALAPPDATA%\Android\Sdk`.
- The project path contains Hebrew characters, so avoid local Gradle builds (ADR-0005).

## Open issues

- `npm audit`: 14 moderate advisories in the Expo template's transitive dependencies (dev tooling). Review in T166.

## Pending approval gates

- none

## Repository / checkpoint

- Checkpoint commit: `M00: foundation` on `master` (local only, not pushed).
