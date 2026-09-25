# AutoKeep Testing & Verification

## Layers (MASTER_EXECUTION.md)

formatting → lint → TypeScript → unit → integration → persistence → security → UI → E2E → Android device

## Commands

| Command                | What                                                      |
| ---------------------- | --------------------------------------------------------- |
| `npm run format:check` | Prettier check                                            |
| `npm run lint`         | ESLint (eslint-config-expo)                               |
| `npm run typecheck`    | `tsc --noEmit`                                            |
| `npm test`             | Jest (jest-expo preset) plus React Native Testing Library |
| `npm run verify`       | all of the above, fail-fast                               |

## Policy

- **Per task:** run proportional checks only, meaning whatever proves that task's acceptance criteria.
- **Milestone gate:** full `npm run verify` plus the milestone-specific gate (for example Android device check at M01/M03, or isolation suite at M18).
- **V1 RC:** complete regression and acceptance on a clean install.
- Never weaken or delete a test to obtain a PASS.
- Tests live beside the code as `*.test.ts(x)`, or in `__tests__/`.
- Domain and engine: pure unit tests with fixtures, and "now" injected.
- Persistence: repository tests against SQLite. In Jest, expo-sqlite is backed by an in-memory adapter (see ADR when introduced).
- UI: RNTL render tests, including RTL, accessibility labels and state variants.
- Android device: the user's phone through Expo Go. Evidence is recorded as a checklist in `task-plan.md`.
